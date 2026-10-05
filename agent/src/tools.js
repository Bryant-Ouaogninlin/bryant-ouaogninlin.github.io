// Les outils que Claude peut appeler, et leur exécution côté serveur.
import { FACTS, etapeLabel } from "./config.js";
import { sendText } from "./whatsapp.js";
import { getLead, getProject, projectsFor, saveCallback, saveLead, setHuman } from "./store.js";

const TYPES = ["site", "video", "digital", "autre"];

// strict:true + additionalProperties:false : l'API garantit que les arguments respectent exactement ce schéma.
export const TOOLS = [
  {
    name: "save_lead",
    description:
      "Enregistre ou complète la demande du client (besoin, délai, budget) et prévient l'équipe. À appeler dès que le type de projet et une description sont connus, puis à chaque précision utile.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Prénom ou nom du client, s'il l'a donné" },
        project_type: { type: "string", enum: TYPES, description: "site, video, digital ou autre" },
        description: { type: "string", description: "Résumé du besoin en une ou deux phrases" },
        deadline: { type: "string", description: "Délai souhaité, tel que dit par le client (vide si inconnu)" },
        budget: { type: "string", description: "Budget approximatif donné par le client (vide si inconnu)" },
      },
      required: ["name", "project_type", "description", "deadline", "budget"],
      additionalProperties: false,
    },
  },
  {
    name: "get_project_status",
    description:
      "Donne l'état d'avancement des projets du client. Sans code, renvoie les projets liés à son numéro WhatsApp. Avec un code (ex. K-003), renvoie ce projet s'il appartient bien à ce client.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { code: { type: "string", description: "Code du projet donné par le client, ou chaîne vide" } },
      required: ["code"],
      additionalProperties: false,
    },
  },
  {
    name: "request_callback",
    description:
      "Note la demande d'un client qui veut être rappelé ou fixer un point. L'équipe confirmera l'horaire : n'annonce jamais d'heure précise.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        preferred_time: { type: "string", description: "Moment souhaité, tel que dit par le client" },
        topic: { type: "string", description: "Sujet de l'échange en quelques mots" },
      },
      required: ["preferred_time", "topic"],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Passe la conversation à l'équipe : l'agent se tait ensuite jusqu'à ce que l'équipe le réactive. À utiliser si le client le demande, s'il est mécontent, si cela touche à l'argent ou à un litige, ou en cas de doute.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "Pourquoi tu passes la main, en une phrase" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export async function notifyOwner(env, text) {
  if (!env.OWNER_NUMBER) return;
  const r = await sendText(env, env.OWNER_NUMBER, text);
  // Hors fenêtre de 24 h, seul un modèle pré-approuvé passe : voir README (TEMPLATE_OWNER_ALERT).
  if (!r.ok && env.TEMPLATE_OWNER_ALERT) {
    const { sendTemplate } = await import("./whatsapp.js");
    await sendTemplate(env, env.OWNER_NUMBER, env.TEMPLATE_OWNER_ALERT, [text.slice(0, 180)]);
  }
}

const show = (n) => (n && n.startsWith("225") ? `+${n}` : `+${n}`);

// Exécute un outil. Retourne toujours une chaîne (JSON) que Claude lira.
export async function runTool(env, ctx, name, input) {
  switch (name) {
    case "save_lead": {
      const type = TYPES.includes(input.project_type) ? input.project_type : "autre";
      const { isNew } = await saveLead(env, ctx.wa, {
        name: input.name || ctx.name,
        type,
        description: input.description,
        deadline: input.deadline,
        budget: input.budget,
      });
      const lead = await getLead(env, ctx.wa);
      await notifyOwner(
        env,
        `${isNew ? "Nouvelle demande" : "Demande mise à jour"} — ${lead.name || ctx.name || "sans nom"} (${show(ctx.wa)})\nType : ${lead.type}\nBesoin : ${lead.description}\nDélai : ${lead.deadline || "non précisé"}\nBudget : ${lead.budget || "non précisé"}`,
      );
      return JSON.stringify({ ok: true, message: "Demande enregistrée et transmise à l'équipe." });
    }

    case "get_project_status": {
      const code = String(input.code || "").trim().toUpperCase();
      const own = await projectsFor(env, ctx.wa);
      let list = own;
      if (code) {
        const p = await getProject(env, code);
        // Un client ne voit jamais le projet d'un autre : on vérifie que le numéro correspond.
        list = p && p.wa === ctx.wa ? [p] : [];
      }
      if (!list.length) {
        return JSON.stringify({ found: false, message: "Aucun projet n'est lié à ce numéro" + (code ? ` avec le code ${code}` : "") + ". Propose de passer la main à l'équipe." });
      }
      return JSON.stringify({
        found: true,
        projects: list.map((p) => ({
          code: p.code,
          titre: p.title,
          type: p.type,
          etape: etapeLabel(p.etape),
          note_pour_le_client: p.note || "",
          derniere_mise_a_jour: p.updated.slice(0, 10),
        })),
      });
    }

    case "request_callback": {
      await saveCallback(env, ctx.wa, { name: ctx.name, preferred_time: input.preferred_time, topic: input.topic });
      await notifyOwner(env, `Demande de rappel — ${ctx.name || "sans nom"} (${show(ctx.wa)})\nSujet : ${input.topic}\nMoment souhaité : ${input.preferred_time}\nRépondez-lui pour confirmer l'horaire.`);
      return JSON.stringify({ ok: true, message: "Demande transmise. L'équipe confirmera l'horaire." });
    }

    case "handoff_to_human": {
      await setHuman(env, ctx.wa, true);
      ctx.handedOff = true;
      await notifyOwner(
        env,
        `Passage de relais — ${ctx.name || "sans nom"} (${show(ctx.wa)})\nRaison : ${input.reason}\nL'agent est en pause pour ce client. Répondez avec /dire ${ctx.wa} votre message, puis /reprendre ${ctx.wa} pour réactiver l'agent.`,
      );
      return JSON.stringify({ ok: true, message: "L'équipe a été prévenue et prend le relais. Dis-le au client." });
    }

    default:
      return JSON.stringify({ error: `Outil inconnu : ${name}` });
  }
}

export { FACTS };
