// Point d'entrée Cloudflare Worker : reçoit les appels de WhatsApp (webhook) et lance l'agent.
import { MESSAGES } from "./config.js";
import { handleClientMessage } from "./agent.js";
import { handleOwnerCommand } from "./owner.js";
import { rateLimited, seenBefore } from "./store.js";
import { markRead, parseIncoming, sendText, verifySignature } from "./whatsapp.js";
import { notifyOwner } from "./notify.js";
import { handlePayRoute } from "./pay.js";

export async function processMessage(env, msg, request) {
  if (await seenBefore(env, msg.id)) return; // Meta renvoie parfois le même message : on ne répond qu'une fois
  await markRead(env, msg.id); // les deux coches bleues

  const isOwner = env.OWNER_NUMBER && msg.from === env.OWNER_NUMBER;

  try {
    if (isOwner && msg.text?.startsWith("/")) {
      await sendText(env, msg.from, await handleOwnerCommand(env, msg.text, request));
      return;
    }
    if (msg.text == null || msg.text === "") {
      await sendText(env, msg.from, MESSAGES.nonTexte);
      return;
    }
    if (!isOwner && (await rateLimited(env, msg.from))) {
      await sendText(env, msg.from, MESSAGES.tropDeMessages);
      return;
    }
    await handleClientMessage(env, msg);
  } catch (e) {
    console.error("Erreur de traitement :", e?.message);
    try {
      await sendText(env, msg.from, MESSAGES.erreur);
      if (!isOwner) await notifyOwner(env, `Erreur technique avec +${msg.from} : ${String(e?.message).slice(0, 200)}`);
    } catch { /* on ne peut rien de plus */ }
  }
}

async function receive(request, env, ctx) {
  const raw = await request.text();
  const ok = await verifySignature(raw, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET);
  if (!ok) return new Response("Signature invalide", { status: 401 });

  let body;
  try { body = JSON.parse(raw); } catch { return new Response("JSON invalide", { status: 400 }); }

  // On répond 200 tout de suite à Meta (sinon il renvoie le message) et on travaille en arrière-plan.
  const work = parseIncoming(body).map((m) => processMessage(env, m, request));
  ctx.waitUntil(Promise.allSettled(work));
  return new Response("ok");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname.startsWith("/pay/")) {
      const r = await handlePayRoute(request, env, ctx, url);
      if (r) return r;
    }
    if (url.pathname === "/webhook") {
      if (request.method === "GET") {
        // Poignée de main de configuration demandée par Meta
        const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN;
        return ok ? new Response(url.searchParams.get("hub.challenge")) : new Response("Refusé", { status: 403 });
      }
      if (request.method === "POST") return receive(request, env, ctx);
    }
    return new Response("Introuvable", { status: 404 });
  },
};
