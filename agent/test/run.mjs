// Tests de bout en bout avec de faux serveurs Meta et Anthropic : aucun compte, aucune clé, aucun coût.
// Lancer : npm install && npm test
import { createHmac } from "node:crypto";
import worker from "../src/index.js";

let passed = 0, failed = 0;
const ok = (cond, label) => { if (cond) { passed++; console.log("  ok  ", label); } else { failed++; console.log("  ECHEC", label); } };

// ---------- faux KV ----------
class FakeKV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, String(v)); }
  async delete(k) { this.m.delete(k); }
}

// ---------- faux Meta + faux Anthropic ----------
function makeWorld(script) {
  const world = { sent: [], reads: [], anthropic: [], script: [...script], anthropicStatus: 200 };
  world.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : {};
    if (u.includes("graph.facebook.com")) {
      if (body.status === "read") world.reads.push(body.message_id);
      else world.sent.push(body);
      return new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 });
    }
    if (u.includes("api.anthropic.com")) {
      world.anthropic.push({ url: u, headers: Object.fromEntries(new Headers(init.headers)), body });
      if (world.anthropicStatus !== 200) return new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }), { status: world.anthropicStatus });
      const next = world.script.shift() ?? { stop_reason: "end_turn", content: [{ type: "text", text: "(plus de script)" }] };
      return new Response(JSON.stringify({
        id: "msg_test", type: "message", role: "assistant", model: body.model, stop_reason: next.stop_reason, stop_sequence: null,
        content: next.content, usage: { input_tokens: 10, output_tokens: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("URL inattendue : " + u);
  };
  return world;
}

const SECRET = "secret-de-test";
const OWNER = "2250700000001";
const mkEnv = (world) => ({
  KV: new FakeKV(), FETCH: world.fetch, ANTHROPIC_API_KEY: "sk-test", WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_ID: "123",
  WHATSAPP_VERIFY_TOKEN: "verif", WHATSAPP_APP_SECRET: SECRET, OWNER_NUMBER: OWNER, MODEL: "claude-opus-5-5", EFFORT: "medium",
});

let counter = 0;
function webhook(from, text, { type = "text", name = "Awa", id } = {}) {
  const msg = { from, id: id ?? `wamid.in${++counter}`, timestamp: "1", type };
  if (type === "text") msg.text = { body: text };
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name } }], messages: [msg] } }] }] });
  const sig = "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
  return { raw, sig, id: msg.id };
}

async function post(env, hook, sigOverride) {
  const waits = [];
  const res = await worker.fetch(
    new Request("https://x.test/webhook", { method: "POST", body: hook.raw, headers: { "x-hub-signature-256": sigOverride ?? hook.sig, "content-type": "application/json" } }),
    env, { waitUntil: (p) => waits.push(p) },
  );
  await Promise.all(waits);
  return res;
}
const textsTo = (world, to) => world.sent.filter((m) => m.to === to && m.type === "text").map((m) => m.text.body);
const toolUse = (id, name, input) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }] });
const say = (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });

// =================================================================
console.log("\n1. Webhook : vérification et signature");
{
  const w = makeWorld([]); const env = mkEnv(w);
  const good = await worker.fetch(new Request("https://x.test/webhook?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=CH42"), env, {});
  ok(good.status === 200 && (await good.text()) === "CH42", "la poignée de main Meta renvoie le challenge");
  const bad = await worker.fetch(new Request("https://x.test/webhook?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=CH42"), env, {});
  ok(bad.status === 403, "un mauvais jeton de vérification est refusé");
  const h = webhook("2250505000001", "Bonjour");
  const r = await post(env, h, "sha256=" + "0".repeat(64));
  ok(r.status === 401 && w.sent.length === 0 && w.anthropic.length === 0, "un appel mal signé est rejeté sans rien envoyer ni appeler Claude");
  const r2 = await post(env, { ...h, sig: undefined }, "");
  ok(r2.status === 401, "un appel sans signature est rejeté");
}

console.log("\n2. Un nouveau client : l'agent enregistre la demande et répond");
{
  const client = "2250505000001";
  const w = makeWorld([
    toolUse("tu_1", "save_lead", { name: "Awa", project_type: "site", description: "Site pour son mariage en décembre", deadline: "fin novembre", budget: "" }),
    say("Bonjour Awa, j'ai bien noté votre demande de site pour votre mariage. L'équipe va revenir vers vous. Avez-vous déjà des photos ?"),
  ]);
  const env = mkEnv(w);
  const h = webhook(client, "Bonjour, je voudrais un site pour mon mariage en décembre");
  const res = await post(env, h);
  ok(res.status === 200, "Meta reçoit un 200 immédiatement");
  ok(w.reads.includes(h.id), "le message est marqué comme lu");
  ok(textsTo(w, client).length === 1 && textsTo(w, client)[0].includes("Awa"), "le client reçoit la réponse de l'agent");
  const owner = textsTo(w, OWNER);
  ok(owner.length === 1 && owner[0].includes("Nouvelle demande") && owner[0].includes("mariage"), "le propriétaire est prévenu avec le résumé de la demande");
  ok(JSON.parse(await env.KV.get(`lead:${client}`)).type === "site", "la demande est enregistrée");

  const req1 = w.anthropic[0].body, req2 = w.anthropic[1].body;
  ok(req1.model === "claude-opus-5-5", "modèle : claude-opus-5-5");
  ok(req1.fallbacks === "default" && /server-side-fallback-2026-07-01/.test(w.anthropic[0].headers["anthropic-beta"] ?? ""), "repli de sécurité automatique activé (fallbacks: default)");
  ok(req1.output_config?.effort === "medium", "effort réglé explicitement");
  ok(req1.temperature === undefined && req1.top_p === undefined && req1.thinking === undefined, "aucun paramètre refusé par ce modèle (température, thinking)");
  ok(req1.system[0].cache_control?.type === "ephemeral" && !JSON.stringify(req1.system[0]).includes("Abidjan"), "le bloc stable est mis en cache, sans donnée qui change");
  ok(req1.tools.length === 4 && req1.tools.every((t) => t.strict === true), "4 outils, arguments garantis par le schéma (strict)");
  const last = req2.messages[req2.messages.length - 1];
  ok(last.role === "user" && last.content[0].type === "tool_result" && last.content[0].tool_use_id === "tu_1", "le résultat de l'outil est renvoyé à Claude dans un seul message");

  // doublon : Meta renvoie le même message
  const before = w.sent.length;
  await post(env, h);
  ok(w.sent.length === before, "un message reçu deux fois n'obtient qu'une seule réponse");

  // mémoire
  w.script.push(say("Avec plaisir. Quelle date limite visez-vous ?"));
  await post(env, webhook(client, "Oui j'ai des photos"));
  const reqN = w.anthropic[w.anthropic.length - 1].body;
  ok(reqN.messages[0].content.includes("mariage") && reqN.messages.length === 3, "l'agent se souvient de la conversation");
}

console.log("\n3. Suivi de projet : chaque client ne voit que le sien");
{
  const A = "2250505000001", B = "2250505000002";
  const w = makeWorld([]); const env = mkEnv(w);
  // le propriétaire crée deux projets
  w.script = [];
  const own = (t) => post(env, webhook(OWNER, t, { name: "Moi" }));
  await own("/nouveau 05 05 00 00 01 | Awa | site | Site de mariage");
  await own("/nouveau 05 05 00 00 02 | Koffi | video | Clip anniversaire");
  ok(textsTo(w, OWNER).some((t) => t.includes("K-001")) && textsTo(w, OWNER).some((t) => t.includes("K-002")), "/nouveau crée les projets K-001 et K-002 (numéro à 10 chiffres normalisé)");
  await own("/etape K-001 proposition | Voici la première maquette, dites-moi ce que vous en pensez.");
  ok(textsTo(w, A).some((t) => t.includes("On propose") && t.includes("première maquette")), "/etape prévient le client avec le message du propriétaire");

  // Awa demande où en est son projet : l'outil renvoie K-001 seulement
  w.script = [toolUse("tu_9", "get_project_status", { code: "" }), say("Votre site est à l'étape « On propose ».")];
  await post(env, webhook(A, "Où en est mon projet ?"));
  const toolMsg = w.anthropic[w.anthropic.length - 1].body.messages.at(-1).content[0].content;
  ok(toolMsg.includes("K-001") && !toolMsg.includes("K-002"), "Awa voit son projet, pas celui de Koffi");

  // Awa essaie de lire le projet de Koffi avec son code
  w.script = [toolUse("tu_10", "get_project_status", { code: "K-002" }), say("Je ne trouve pas ce projet.")];
  await post(env, webhook(A, "Et le projet K-002 ?"));
  const toolMsg2 = w.anthropic[w.anthropic.length - 1].body.messages.at(-1).content[0].content;
  ok(toolMsg2.includes('"found":false') && !toolMsg2.includes("Clip"), "un client ne peut pas lire le projet d'un autre avec son code");
}

console.log("\n4. Passage de relais à l'humain");
{
  const C = "2250505000003";
  const w = makeWorld([toolUse("tu_h", "handoff_to_human", { reason: "Le client veut négocier le prix" }), say("Je transmets à l'équipe, qui vous répond bientôt.")]);
  const env = mkEnv(w);
  await post(env, webhook(C, "Je veux parler à quelqu'un, c'est trop cher", { name: "Yao" }));
  ok(textsTo(w, OWNER).some((t) => t.includes("Passage de relais") && t.includes("/dire")), "le propriétaire est prévenu avec la marche à suivre");
  const calls = w.anthropic.length;
  await post(env, webhook(C, "Vous êtes là ?", { name: "Yao" }));
  ok(w.anthropic.length === calls, "ensuite l'agent se tait (aucun appel à Claude)");
  ok(textsTo(w, OWNER).some((t) => t.includes("Vous êtes là ?")), "mais le message du client est transmis au propriétaire");
  await post(env, webhook(OWNER, `/dire ${C} Bonjour Yao, je prends le relais.`, { name: "Moi" }));
  ok(textsTo(w, C).some((t) => t.includes("je prends le relais")), "/dire envoie la réponse du propriétaire au client");
  await post(env, webhook(OWNER, `/reprendre ${C}`, { name: "Moi" }));
  w.script = [say("Bonjour de nouveau !")];
  await post(env, webhook(C, "Merci", { name: "Yao" }));
  ok(textsTo(w, C).some((t) => t.includes("de nouveau")), "/reprendre réactive l'agent");
}

console.log("\n5. Cas limites");
{
  const D = "2250505000004";
  const w = makeWorld([]); const env = mkEnv(w);
  await post(env, webhook(D, null, { type: "audio" }));
  ok(textsTo(w, D)[0]?.includes("messages écrits") && w.anthropic.length === 0, "un message vocal reçoit une réponse polie sans appeler Claude");

  w.script = [{ stop_reason: "refusal", content: [] }];
  await post(env, webhook(D, "message décliné"));
  ok(textsTo(w, D).some((t) => t.includes("transmets votre message à l'équipe")) && textsTo(w, OWNER).some((t) => t.includes("décliné")), "un refus de sécurité est géré : réponse neutre et propriétaire prévenu");

  w.anthropicStatus = 500;
  await post(env, webhook(D, "test panne"));
  ok(textsTo(w, D).some((t) => t.includes("petit souci technique")) && textsTo(w, OWNER).some((t) => t.includes("Erreur technique")), "une panne de Claude ne laisse pas le client sans réponse");
  w.anthropicStatus = 200;

  // anti-abus : 16 messages dans la minute
  const E = "2250505000005";
  w.script = Array.from({ length: 30 }, () => say("ok"));
  let blocked = false;
  for (let i = 0; i < 17; i++) { await post(env, webhook(E, `m${i}`)); }
  blocked = textsTo(w, E).some((t) => t.includes("très vite"));
  ok(blocked, "un expéditeur qui écrit trop vite est freiné (protège le budget)");

  const R = await post(env, webhook(OWNER, "/inconnue", { name: "Moi" }));
  ok(textsTo(w, OWNER).at(-1).includes("/aide"), "une commande inconnue renvoie vers /aide");
}

console.log(`\n${passed} réussis, ${failed} échoués`);
process.exit(failed ? 1 : 0);
