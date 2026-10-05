// Les outils que Claude peut appeler, et leur exécution côté serveur.
import { etapeLabel } from "./config.js";
import { notifyOwner } from "./notify.js";
import { bankInfo, declarePayment, fmtFcfa, manualOperators, payLink } from "./pay.js";
import { getLead, getProject, paymentsFor, projectsFor, saveCallback, saveLead, setHuman } from "./store.js";

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
    name: "get_payments",
    description:
      "Donne les paiements et les liens de paiement du client (montant, objet, statut). Sert à répondre « j'ai payé, avez-vous reçu ? » ou à renvoyer un lien de paiement encore en attente. Tu ne crées jamais de lien toi-même : c'est l'équipe qui les émet.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "declare_payment",
    description:
      "Enregistre que le client dit avoir payé (Mobile Money ou virement bancaire). Cela NE valide PAS le paiement : l'équipe vérifie dans son application et confirme. À appeler quand le client écrit « j'ai payé » ou envoie une référence de transaction. Dis-lui ensuite que l'équipe vérifie et qu'il recevra une confirmation.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reference: { type: "string", description: "Référence du paiement (commence par KP), ou chaîne vide pour prendre le dernier paiement en attente" },
        operator: { type: "string", enum: ["Wave", "Orange Money", "MTN MoMo", "Moov Money", "Virement bancaire", "autre"], description: "Moyen utilisé par le client" },
        transaction_reference: { type: "string", description: "Numéro de transaction donné par le client, ou chaîne vide" },
      },
      required: ["reference", "operator", "transaction_reference"],
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

    case "get_payments": {
      const list = (await paymentsFor(env, ctx.wa)).slice(0, 5);
      if (!list.length) return JSON.stringify({ found: false, message: "Aucun paiement ni lien de paiement pour ce numéro. Si le client attend un lien, propose de passer la main à l'équipe." });
      const statut = { pending: "en attente de paiement", declared: "annoncé par le client, en cours de vérification par l'équipe", paid: "payé", failed: "échoué ou refusé" };
      return JSON.stringify({
        found: true,
        paiements: list.map((p) => ({
          reference: p.ref, objet: p.label, montant: fmtFcfa(p.amount), statut: statut[p.status] || p.status,
          lien_de_paiement: p.status === "pending" ? payLink(env, p.ref) : undefined,
          moyens_de_paiement: p.mode === "manual" && p.status === "pending"
            ? [...manualOperators(env).map((o) => `${o.operator} : ${o.number}`), ...(bankInfo(env) ? [`Virement bancaire : ${bankInfo(env).bank} ${bankInfo(env).holder} ${bankInfo(env).rib}`.replace(/\s+/g, " ")] : [])]
            : undefined,
        })),
      });
    }

    case "declare_payment": {
      const mine = await paymentsFor(env, ctx.wa);
      const ref = String(input.reference || "").trim().toUpperCase();
      const target = ref ? mine.find((p) => p.ref === ref) : mine.find((p) => p.mode === "manual" && p.status === "pending");
      if (!target) return JSON.stringify({ ok: false, message: "Aucun paiement en attente pour ce client. Propose de passer la main à l'équipe." });
      const r = await declarePayment(env, target.ref, { operator: input.operator === "autre" ? "" : input.operator, txref: input.transaction_reference, wa: ctx.wa });
      return JSON.stringify(r.ok ? { ok: true, statut: r.status, message: r.status === "paid" ? "Ce paiement est déjà confirmé." : "L'équipe a été prévenue et vérifie le paiement. Dis au client qu'il recevra une confirmation ici." } : { ok: false, message: r.error });
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

