// La boucle de l'agent : un message client -> Claude (avec outils) -> une réponse WhatsApp.
import Anthropic from "@anthropic-ai/sdk";
import { MESSAGES, systemPrompt } from "./config.js";
import { sendText } from "./whatsapp.js";
import { getConv, isHuman, saveConv } from "./store.js";
import { notifyOwner } from "./notify.js";
import { TOOLS, runTool } from "./tools.js";

const MAX_STEPS = 6; // un message client ne peut pas déclencher plus de 6 allers-retours avec Claude

export function makeClient(env) {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: env.FETCH, maxRetries: 2 });
}

// Informations qui changent à chaque message : placées APRÈS le bloc mis en cache, pour ne pas l'invalider.
function dynamicContext(msg, conv) {
  const now = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", dateStyle: "full", timeStyle: "short" });
  return `Contexte de cette conversation : nous sommes le ${now} (Abidjan). Le client s'appelle « ${conv.name || msg.name || "inconnu"} » et écrit depuis le numéro ${msg.from}.`;
}

export async function handleClientMessage(env, msg) {
  const conv = await getConv(env, msg.from);
  if (msg.name && !conv.name) conv.name = msg.name;
  const text = msg.text.slice(0, 2000);

  // Conversation reprise par l'équipe : l'agent se tait, mais on transmet le message pour que personne ne le rate.
  if (await isHuman(env, msg.from)) {
    conv.messages.push({ role: "user", content: text });
    await saveConv(env, msg.from, conv);
    await notifyOwner(env, `Message de ${conv.name || "client"} (+${msg.from}) :\n${text}\n\nRépondre : /dire ${msg.from} votre message`);
    return;
  }

  const client = makeClient(env);
  const ctx = { wa: msg.from, name: conv.name, handedOff: false };
  const messages = [...conv.messages, { role: "user", content: text }];
  let reply = "";
  let refused = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    // client.beta.messages : nécessaire pour le repli automatique (fallbacks) si les classificateurs de sécurité déclinent.
    const res = await client.beta.messages.create({
      model: env.MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: env.EFFORT || "medium" },
      system: [
        { type: "text", text: systemPrompt(), cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: dynamicContext(msg, conv) },
      ],
      tools: TOOLS,
      messages,
    });

    if (res.stop_reason === "refusal") { refused = true; break; }

    // On renvoie la réponse de Claude telle quelle (blocs de réflexion compris) pour continuer le même tour.
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      reply = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      break;
    }

    // Tous les résultats d'outils reviennent dans UN seul message.
    const results = [];
    for (const block of res.content.filter((b) => b.type === "tool_use")) {
      let out;
      try {
        out = await runTool(env, ctx, block.name, block.input ?? {});
      } catch (e) {
        console.error(`Outil ${block.name} en erreur :`, e?.message);
        out = JSON.stringify({ error: "Erreur technique : l'outil n'a pas pu s'exécuter. Propose de passer la main." });
        results.push({ type: "tool_result", tool_use_id: block.id, content: out, is_error: true });
        continue;
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  if (refused) {
    await notifyOwner(env, `Un message de +${msg.from} a été décliné par les filtres de sécurité. À lire :\n${text.slice(0, 300)}`);
    reply = MESSAGES.refus;
  }
  if (!reply) reply = MESSAGES.erreur;

  // On ne garde en mémoire que le texte échangé (pas les blocs d'outils ni de réflexion).
  conv.messages.push({ role: "user", content: text }, { role: "assistant", content: reply });
  await saveConv(env, msg.from, conv);
  await sendText(env, msg.from, reply);
}
