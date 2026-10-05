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
  const world = { sent: [], reads: [], anthropic: [], cinetpay: [], script: [...script], anthropicStatus: 200 };
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
    if (u.includes("api-checkout.cinetpay.com")) {
      world.cinetpay.push({ url: u, body });
      if (u.endsWith("/v2/payment")) {
        if (world.cinetpayInitFail) return new Response(JSON.stringify({ code: "608", message: "MINIMUM_REQUIRED_FIELDS" }), { status: 200 });
        return new Response(JSON.stringify({ code: "201", message: "CREATED", data: { payment_token: "tok_" + body.transaction_id, payment_url: "https://checkout.cinetpay.com/payment/tok_" + body.transaction_id } }), { status: 200 });
      }
      if (u.endsWith("/v2/payment/check")) {
        const r = world.checkReply ?? { code: "662", message: "WAITING_CUSTOMER_PAYMENT", data: { status: "WAITING_FOR_CUSTOMER" } };
        return new Response(JSON.stringify(r), { status: 200 });
      }
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
  CINETPAY_API_KEY: "cp-key", CINETPAY_SITE_ID: "cp-site", SITE_URL: "https://site.test", WORKER_URL: "https://agent.test",
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
  ok(req1.tools.length === 5 && req1.tools.every((t) => t.strict === true), "5 outils, arguments garantis par le schéma (strict)");
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

console.log("\n6. Paiements CinetPay");
{
  const P = "2250505000006";
  const w = makeWorld([]); const env = mkEnv(w);
  const own = (t) => post(env, webhook(OWNER, t, { name: "Moi" }));
  const lastOwner = () => textsTo(w, OWNER).at(-1);

  await own("/nouveau 05 05 00 00 06 | Mariam | site | Site de mariage");
  await own("/paiement K-001 50003 | acompte");
  ok(lastOwner().includes("multiple de 5") && w.cinetpay.length === 0, "un montant qui n'est pas un multiple de 5 est refusé avant tout appel à CinetPay");
  await own("/paiement K-001 50 | acompte");
  ok(lastOwner().includes("au moins 100"), "un montant trop petit est refusé");

  await own("/paiement K-001 50000 | acompte");
  const init = w.cinetpay.find((c) => c.url.endsWith("/v2/payment"));
  ok(init && init.body.amount === 50000 && init.body.currency === "XOF" && init.body.apikey === "cp-key" && init.body.site_id === "cp-site", "le lien est créé chez CinetPay (50 000 XOF, clés envoyées)");
  ok(init.body.notify_url === "https://agent.test/pay/notify" && init.body.return_url.startsWith("https://agent.test/pay/return?ref="), "adresses de notification et de retour pointent vers le Worker");
  ok(!/[#\/$_&]/.test(init.body.description) && /^[A-Z0-9]+$/.test(init.body.transaction_id), "description et identifiant sans caractères interdits par CinetPay");
  const ref = init.body.transaction_id;
  const toClient = textsTo(w, P).at(-1);
  ok(toClient.includes("50 000 FCFA") && toClient.includes(`https://site.test/paiement.html?ref=${ref}`), "le client reçoit un lien vers la page de paiement du site");

  // statut public
  const st1 = await worker.fetch(new Request(`https://agent.test/pay/status?ref=${ref}`), env, { waitUntil() {} });
  const j1 = await st1.json();
  ok(st1.status === 200 && j1.status === "pending" && j1.url.includes("checkout.cinetpay.com") && j1.amount === 50000, "la page du site peut lire le statut et l'adresse de paiement");
  ok(!JSON.stringify(j1).includes(P) && !JSON.stringify(j1).includes("Mariam"), "le statut public ne contient aucune donnée personnelle");
  ok(st1.headers.get("access-control-allow-origin") === "https://site.test", "seul le site est autorisé à lire ce statut (CORS)");
  const st404 = await worker.fetch(new Request("https://agent.test/pay/status?ref=INCONNU1"), env, { waitUntil() {} });
  ok(st404.status === 404, "une référence inconnue renvoie 404");

  // fausse notification : CinetPay dit « en attente » -> rien ne change
  const notify = async (r) => { const waits = []; const res = await worker.fetch(new Request("https://agent.test/pay/notify", { method: "POST", body: new URLSearchParams({ cpm_trans_id: r }), headers: { "content-type": "application/x-www-form-urlencoded" } }), env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); return res; };
  const ownerBefore = textsTo(w, OWNER).length;
  await notify(ref);
  ok(JSON.parse(await env.KV.get(`pay:${ref}`)).status === "pending" && textsTo(w, OWNER).length === ownerBefore, "une notification seule ne valide rien : on vérifie auprès de CinetPay");

  // CinetPay annonce un paiement d'un AUTRE montant : refusé et signalé
  w.checkReply = { code: "00", message: "SUCCES", data: { status: "ACCEPTED", amount: "100", currency: "XOF", payment_method: "OM" } };
  await notify(ref);
  ok(JSON.parse(await env.KV.get(`pay:${ref}`)).status === "pending" && textsTo(w, OWNER).at(-1).includes("ne correspond pas"), "un paiement dont le montant ne correspond pas n'est pas accepté et vous êtes alerté");

  // le vrai paiement
  w.checkReply = { code: "00", message: "SUCCES", data: { status: "ACCEPTED", amount: "50000", currency: "XOF", payment_method: "WAVECI", payment_date: "2026-10-05 15:00:00" } };
  await notify(ref);
  const paid = JSON.parse(await env.KV.get(`pay:${ref}`));
  ok(paid.status === "paid" && paid.method === "WAVECI", "le paiement vérifié est marqué payé");
  ok(textsTo(w, OWNER).at(-1).includes("Paiement reçu") && textsTo(w, OWNER).at(-1).includes("50 000 FCFA"), "vous êtes prévenu du paiement");
  ok(textsTo(w, P).at(-1).includes("bien reçu votre paiement"), "le client reçoit un accusé de réception");
  ok(JSON.parse(await env.KV.get("proj:K-001")).paid === 50000, "le total payé est ajouté au projet");

  // idempotence : une notification en double ne crée pas de second message
  const before = w.sent.length;
  await notify(ref);
  ok(w.sent.length === before, "une notification en double n'envoie rien de plus");

  // retour du client
  const ret = await worker.fetch(new Request(`https://agent.test/pay/return?ref=${ref}`, { method: "POST" }), env, { waitUntil() {} });
  ok(ret.status === 303 && ret.headers.get("location") === `https://site.test/paiement.html?ref=${ref}`, "le retour du client (même en POST) est redirigé vers le site");

  // l'agent peut renvoyer un lien en attente, jamais en créer
  await own("/paiement K-001 25000 | solde");
  const ref2 = w.cinetpay.filter((c) => c.url.endsWith("/v2/payment")).at(-1).body.transaction_id;
  w.script = [toolUse("tu_p", "get_payments", {}), say("Voici votre lien.")];
  await post(env, webhook(P, "Pouvez-vous me renvoyer le lien de paiement ?", { name: "Mariam" }));
  const tm = w.anthropic.at(-1).body.messages.at(-1).content[0].content;
  ok(tm.includes(`paiement.html?ref=${ref2}`) && tm.includes('"statut":"payé"'), "l'agent retrouve le lien en attente et le paiement déjà reçu");

  // un autre client ne voit pas ces paiements
  w.script = [toolUse("tu_q", "get_payments", {}), say("Rien.")];
  await post(env, webhook("2250505000007", "J'ai payé ?", { name: "Autre" }));
  ok(w.anthropic.at(-1).body.messages.at(-1).content[0].content.includes('"found":false'), "un autre client ne voit aucun paiement");

  // paiement hors ligne et liste
  await own("/paye K-001 10000 | espèces");
  ok(lastOwner().includes("enregistré") && JSON.parse(await env.KV.get("proj:K-001")).paid === 60000, "/paye enregistre un paiement hors ligne");
  await own("/paiements");
  ok(lastOwner().includes("payé") && lastOwner().includes("en attente"), "/paiements liste les paiements et leur statut");

  // CinetPay refuse la création : message clair
  w.cinetpayInitFail = true;
  await own("/paiement K-001 5000 | test");
  ok(lastOwner().includes("CinetPay a refusé"), "si CinetPay refuse la demande, vous recevez une explication");
}

console.log(`\n${passed} réussis, ${failed} échoués`);
process.exit(failed ? 1 : 0);
