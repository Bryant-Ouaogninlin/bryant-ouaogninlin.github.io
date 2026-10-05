// Mode « menu » : l'agent répond sans IA, par chiffres. Gratuit, utilisé tant qu'il n'y a pas de clé Anthropic
// (ou si AGENT_MODE = menu). Les demandes, rappels, suivis et passages de relais arrivent au même endroit que
// ceux de l'agent IA : on réutilise les mêmes outils.
import { etapeLabel } from "./config.js";
import { sendText } from "./whatsapp.js";
import { getLead, projectsFor, saveConv } from "./store.js";
import { runTool } from "./tools.js";

const TYPES = { 1: "site", 2: "video", 3: "digital" };

const MENU =
  "Je suis l'assistant de Kinéo. Répondez par un chiffre :\n" +
  "1. Un site web\n2. Un montage vidéo\n3. Du digital (visuels, réseaux sociaux)\n" +
  "4. Suivre mon projet\n5. Être rappelé\n6. Parler à l'équipe";

const hello = (name) => `Bonjour${name ? " " + name : ""} ! ${MENU}`;
const GREETING = /^(menu|accueil|0|bonjour|bonsoir|salut|hello|hi|coucou)\s*[!.]*$/i;

export async function handleMenuMessage(env, msg, conv) {
  const text = msg.text.trim().slice(0, 600);
  const st = conv.menu || {};
  const known = !!conv.menu; // déjà vu le menu dans cette conversation
  const ctx = { wa: msg.from, name: conv.name, handedOff: false };
  let reply;

  const go = (next) => { conv.menu = next; };

  if (GREETING.test(text)) {
    go({});
    reply = hello(conv.name);
  } else if (st.step === "describe") {
    await runTool(env, ctx, "save_lead", { name: conv.name || "", project_type: st.type, description: text, deadline: "", budget: "" });
    go({ step: "deadline" });
    reply = "Merci, c'est noté. Pour quand en avez-vous besoin ? Une date, ou « pas pressé ».";
  } else if (st.step === "deadline") {
    const lead = await getLead(env, msg.from);
    await runTool(env, ctx, "save_lead", { name: conv.name || "", project_type: lead?.type || "autre", description: lead?.description || "Voir le message précédent", deadline: text, budget: "" });
    go({});
    reply = "Merci ! Votre demande est transmise à l'équipe, qui vous répondra ici. Envoyez « menu » pour revenir au début.";
  } else if (st.step === "callback") {
    await runTool(env, ctx, "request_callback", { preferred_time: text, topic: "Demande de rappel (menu)" });
    go({});
    reply = "C'est noté. L'équipe vous contactera pour confirmer l'horaire. Envoyez « menu » pour revenir au début.";
  } else {
    const choice = /^([1-6])\b/.exec(text)?.[1];
    if (TYPES[choice]) {
      go({ step: "describe", type: TYPES[choice] });
      reply = "Parfait. Décrivez-moi votre projet en quelques lignes : pour qui, ce que vous imaginez, le style que vous aimez.";
    } else if (choice === "4") {
      const list = await projectsFor(env, msg.from);
      go({});
      reply = list.length
        ? "Voici vos projets :\n" + list.map((p) => `${p.code} — ${p.title} : ${etapeLabel(p.etape)}${p.note ? " (" + p.note + ")" : ""}`).join("\n")
        : "Je ne trouve aucun projet lié à ce numéro. Envoyez 6 pour que l'équipe vérifie avec vous.";
    } else if (choice === "5") {
      go({ step: "callback" });
      reply = "Quand souhaitez-vous être rappelé ? Donnez-moi un jour et une heure, ou une période.";
    } else if (choice === "6") {
      go({});
      await runTool(env, ctx, "handoff_to_human", { reason: "Le client a choisi « Parler à l'équipe » dans le menu." });
      reply = "L'équipe est prévenue et vous répondra ici dès que possible.";
    } else {
      go({});
      reply = known ? `Je n'ai pas compris. ${MENU}` : hello(conv.name);
    }
  }

  await saveConv(env, msg.from, conv);
  await sendText(env, msg.from, reply);
}
