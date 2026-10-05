// Paiements via CinetPay (Wave, Orange Money, MTN MoMo, Moov Money, cartes) : on crée un lien, le client paie sur la page
// sécurisée de CinetPay (Kinéo ne voit jamais de numéro de carte ni de code secret), puis CinetPay nous prévient.
// RÈGLE : on ne croit jamais l'appel de notification tel quel. On redemande toujours le statut à CinetPay avant de valider.
import { getPayment, getProject, savePayment, updateProject } from "./store.js";
import { isWindowError, sendTemplate, sendText } from "./whatsapp.js";
import { notifyOwner } from "./notify.js";

const API = "https://api-checkout.cinetpay.com/v2";
const DEFAULT_SITE = "https://bryant-ouaogninlin.github.io";

// Deux modes : « cinetpay » (lien de paiement en ligne) ou « manual » (le client envoie par Mobile Money sur vos numéros,
// puis vous confirmez à la main). Le mode manuel s'active tout seul tant que les clés CinetPay ne sont pas renseignées.
export const cinetpayReady = (env) => Boolean(env.CINETPAY_API_KEY && env.CINETPAY_SITE_ID) && env.PAY_MODE !== "manual";

export function manualOperators(env) {
  const ops = [];
  for (const [operator, key] of [["Wave", "MM_WAVE"], ["Orange Money", "MM_ORANGE"], ["MTN MoMo", "MM_MTN"], ["Moov Money", "MM_MOOV"]]) {
    if (env[key] && String(env[key]).trim()) ops.push({ operator, number: String(env[key]).trim() });
  }
  return ops;
}

// Virement bancaire : banque, titulaire et RIB/IBAN, renseignés dans Cloudflare (BANK_NAME, BANK_HOLDER, BANK_RIB).
export function bankInfo(env) {
  if (!env.BANK_RIB || !String(env.BANK_RIB).trim()) return null;
  return { bank: String(env.BANK_NAME || "").trim(), holder: String(env.BANK_HOLDER || env.MM_HOLDER || "").trim(), rib: String(env.BANK_RIB).trim() };
}

// Tous les moyens que le client peut utiliser (utile pour valider ce qu'il annonce).
export const manualMethods = (env) => [...manualOperators(env).map((o) => o.operator), ...(bankInfo(env) ? ["Virement bancaire"] : [])];

export const fmtFcfa = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
export const siteUrl = (env) => (env.SITE_URL || DEFAULT_SITE).replace(/\/$/, "");
export const payLink = (env, ref) => `${siteUrl(env)}/paiement.html?ref=${ref}`;
const workerUrl = (env, request) => (env.WORKER_URL || new URL(request.url).origin).replace(/\/$/, "");

function newRef() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return "KP" + [...a].map((b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
}

const clean = (s) => String(s ?? "").replace(/[#/$_&<>"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100); // CinetPay déconseille ces caractères

async function cinetpay(env, path, body) {
  const res = await (env.FETCH ?? fetch)(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: env.CINETPAY_API_KEY, site_id: env.CINETPAY_SITE_ID, ...body }),
  });
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  return { http: res.status, json };
}

// Crée un paiement et le lien CinetPay. Le montant est fixé par vous, jamais par le client.
export async function createPayment(env, request, { amount, label, wa, name = "", project = "" }) {
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt < 100) return { ok: false, error: "Le montant doit être un nombre entier d'au moins 100 FCFA." };
  if (amt > 5_000_000) return { ok: false, error: "Montant trop élevé : vérifiez le nombre de zéros." };
  if (!cinetpayReady(env)) return createManualRequest(env, { amt, label, wa, name, project });
  if (amt % 5 !== 0) return { ok: false, error: "Le montant doit être un multiple de 5 (règle de CinetPay)." };

  const ref = newRef();
  const base = workerUrl(env, request);
  const { http, json } = await cinetpay(env, "/payment", {
    transaction_id: ref,
    amount: amt,
    currency: "XOF",
    description: clean(label) || "Prestation Kineo",
    notify_url: `${base}/pay/notify`,
    return_url: `${base}/pay/return?ref=${ref}`, // le Worker redirige ensuite vers le site (le site statique n'accepte pas les retours en POST)
    channels: "ALL",
    lang: "fr",
    metadata: ref,
    customer_name: clean(name) || "Client",
    customer_surname: "Kineo",
    customer_email: env.CONTACT_EMAIL || "kineo.digi@gmail.com",
    customer_phone_number: `+${wa}`,
    customer_address: "Abidjan",
    customer_city: "Abidjan",
    customer_country: "CI",
    customer_state: "CI",
    customer_zip_code: "00225",
  });
  const url = json?.data?.payment_url;
  if (http >= 400 || !url) {
    console.error(`CinetPay init a échoué : HTTP ${http}, code ${json?.code}, ${json?.message ?? ""}`);
    return { ok: false, error: `CinetPay a refusé la demande (${json?.message || "erreur " + http}).` };
  }
  const now = new Date().toISOString();
  const pay = { ref, mode: "cinetpay", amount: amt, currency: "XOF", label: clean(label), project, wa, name, status: "pending", url, method: "", created: now, updated: now, paidAt: "" };
  await savePayment(env, pay);
  return { ok: true, pay };
}

// Demande de paiement par Mobile Money direct : pas d'intermédiaire, vous confirmez vous-même chaque paiement.
async function createManualRequest(env, { amt, label, wa, name, project }) {
  if (!manualMethods(env).length) return { ok: false, error: "Aucun moyen de paiement manuel n'est configuré (variables MM_WAVE, MM_ORANGE, MM_MTN, MM_MOOV ou BANK_RIB dans Cloudflare)." };
  const now = new Date().toISOString();
  const pay = { ref: newRef(), mode: "manual", amount: amt, currency: "XOF", label: clean(label), project, wa, name, status: "pending", url: "", method: "", created: now, updated: now, paidAt: "" };
  await savePayment(env, pay);
  return { ok: true, pay };
}

// Message envoyé au client pour un paiement manuel : numéros, titulaire, référence.
export function manualMessage(env, pay) {
  const ops = manualOperators(env);
  const bank = bankInfo(env);
  const holder = env.MM_HOLDER ? ` (au nom de ${env.MM_HOLDER})` : "";
  const parts = [`Bonjour${pay.name ? " " + pay.name : ""}, pour régler ${pay.label} : ${fmtFcfa(pay.amount)}.`];
  if (ops.length) parts.push(`Par Mobile Money${holder} :\n${ops.map((o) => `• ${o.operator} : ${o.number}`).join("\n")}`);
  if (bank) parts.push(`Ou par virement bancaire :\n${bank.bank ? "• Banque : " + bank.bank + "\n" : ""}${bank.holder ? "• Titulaire : " + bank.holder + "\n" : ""}• RIB / IBAN : ${bank.rib}`);
  parts.push(`Référence à indiquer si possible (commentaire ou motif du virement) : ${pay.ref}`);
  parts.push(`Une fois fait, appuyez sur « J'ai payé » ici : ${payLink(env, pay.ref)} ou répondez-moi « j'ai payé ». Nous vérifions, puis nous vous confirmons.`);
  return parts.join("\n\n");
}

// Le client annonce qu'il a payé. Rien n'est validé : le propriétaire vérifie dans son application Mobile Money.
export async function declarePayment(env, ref, { operator = "", txref = "", wa = "" } = {}) {
  const pay = await getPayment(env, ref);
  if (!pay || pay.mode !== "manual") return { ok: false, error: "Paiement introuvable." };
  if (wa && pay.wa !== wa) return { ok: false, error: "Paiement introuvable." };
  if (pay.status === "paid") return { ok: true, status: "paid" };
  if (pay.status === "declared") return { ok: true, status: "declared" };
  const now = new Date().toISOString();
  const next = { ...pay, status: "declared", declared: { operator: String(operator).slice(0, 30), txref: String(txref).replace(/[^\w\- ]/g, "").slice(0, 40), at: now }, updated: now };
  await savePayment(env, next);
  await notifyOwner(env, `Paiement annoncé — ${fmtFcfa(pay.amount)} par ${pay.name || "client"} (+${pay.wa})\n${pay.label}${pay.project ? " · projet " + pay.project : ""}\nMoyen : ${next.declared.operator || "non précisé"}${next.declared.txref ? " · transaction " + next.declared.txref : ""} · réf. ${pay.ref}\n\nVérifiez dans votre application Mobile Money ou sur votre compte bancaire, puis :\n/confirme ${pay.ref}   (valider)\n/annule ${pay.ref}   (refuser)`);
  return { ok: true, status: "declared" };
}

// Le propriétaire a vu l'argent arriver : le paiement devient « payé ».
export async function confirmPayment(env, ref) {
  const pay = await getPayment(env, String(ref).toUpperCase());
  if (!pay) return { ok: false, error: "Référence introuvable. Voir /paiements." };
  if (pay.status === "paid") return { ok: false, error: `${pay.ref} est déjà payé.` };
  const now = new Date().toISOString();
  const next = { ...pay, status: "paid", method: pay.declared?.operator || pay.method || "Mobile Money", paidAt: now, updated: now };
  await savePayment(env, next);
  await afterPaid(env, next, { silentOwner: true });
  return { ok: true, pay: next };
}

export async function cancelPayment(env, ref) {
  const pay = await getPayment(env, String(ref).toUpperCase());
  if (!pay) return { ok: false, error: "Référence introuvable. Voir /paiements." };
  if (pay.status === "paid") return { ok: false, error: `${pay.ref} est déjà payé : annulation impossible ici.` };
  const next = { ...pay, status: "failed", updated: new Date().toISOString() };
  await savePayment(env, next);
  return { ok: true, pay: next };
}

// Enregistre un paiement reçu hors ligne (espèces, virement, Mobile Money direct).
export async function recordManualPayment(env, { amount, label, wa, name = "", project = "", method = "manuel" }) {
  const now = new Date().toISOString();
  const pay = { ref: newRef(), mode: "manual", amount: Number(amount), currency: "XOF", label: clean(label), project, wa, name, status: "paid", url: "", method, created: now, updated: now, paidAt: now };
  await savePayment(env, pay);
  await afterPaid(env, pay, { silentOwner: true });
  return pay;
}

async function afterPaid(env, pay, { silentOwner = false } = {}) {
  if (pay.project) {
    const proj = await getProject(env, pay.project);
    if (proj) await updateProject(env, proj.code, { paid: (proj.paid || 0) + pay.amount });
  }
  if (!silentOwner) await notifyOwner(env, `Paiement reçu — ${fmtFcfa(pay.amount)} de ${pay.name || "client"} (+${pay.wa})\n${pay.label}${pay.project ? " · projet " + pay.project : ""}\nMoyen : ${pay.method || "?"} · réf. ${pay.ref}`);
  const msg = `Merci ${pay.name || ""} ! Nous avons bien reçu votre paiement de ${fmtFcfa(pay.amount)} (${pay.label}). Référence : ${pay.ref}.`.replace("  ", " ");
  let r = await sendText(env, pay.wa, msg);
  if (isWindowError(r) && env.TEMPLATE_PAYMENT_OK) r = await sendTemplate(env, pay.wa, env.TEMPLATE_PAYMENT_OK, [pay.name || "", fmtFcfa(pay.amount), pay.ref]);
}

// Vérifie auprès de CinetPay (source de vérité) et met à jour notre enregistrement. Idempotent.
export async function verifyAndApply(env, ref) {
  const pay = await getPayment(env, ref);
  if (!pay || pay.status === "paid" || pay.mode === "manual") return pay; // le mode manuel se confirme à la main
  const { json } = await cinetpay(env, "/payment/check", { transaction_id: ref });
  const d = json?.data;
  if (json?.code === "00" && d?.status === "ACCEPTED") {
    // On contrôle aussi le montant et la devise : un paiement partiel ou truqué n'est jamais accepté.
    if (Number(d.amount) === pay.amount && (d.currency || "XOF") === pay.currency) {
      const next = { ...pay, status: "paid", method: d.payment_method || "", paidAt: new Date().toISOString(), updated: new Date().toISOString() };
      await savePayment(env, next);
      await afterPaid(env, next);
      return next;
    }
    await notifyOwner(env, `Alerte : CinetPay annonce un paiement ${ref} dont le montant (${d.amount} ${d.currency}) ne correspond pas au montant attendu (${pay.amount}). Rien n'a été validé.`);
    return pay;
  }
  if (d?.status === "REFUSED") {
    const next = { ...pay, status: "failed", updated: new Date().toISOString() };
    await savePayment(env, next);
    return next;
  }
  return pay; // en attente (WAITING_FOR_CUSTOMER) ou réponse inattendue : on ne change rien
}

const cors = (env) => ({
  "Access-Control-Allow-Origin": siteUrl(env),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  Vary: "Origin",
});
const json = (env, obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors(env) } });

// ---------- routes HTTP ----------
export async function handlePayRoute(request, env, ctx, url) {
  const path = url.pathname;

  if (request.method === "OPTIONS" && (path === "/pay/status" || path === "/pay/declare")) return new Response(null, { status: 204, headers: cors(env) });

  // Le client annonce depuis le site qu'il a payé (mode manuel). Limité à un appel par minute et par référence.
  if (path === "/pay/declare" && request.method === "POST") {
    let b = {};
    try { b = await request.json(); } catch { return json(env, { error: "Requête invalide" }, 400); }
    const ref = String(b.ref || "").replace(/[^A-Z0-9]/g, "");
    const pay = ref ? await getPayment(env, ref) : null;
    if (!pay || pay.mode !== "manual") return json(env, { error: "Référence introuvable" }, 404);
    const operator = manualMethods(env).includes(b.operator) ? b.operator : "";
    if (await env.KV.get(`dec:${ref}`)) return json(env, { ok: true, status: pay.status });
    await env.KV.put(`dec:${ref}`, "1", { expirationTtl: 60 });
    const r = await declarePayment(env, ref, { operator, txref: b.txref || "" });
    return json(env, { ok: r.ok, status: r.status });
  }

  // CinetPay nous prévient (POST, parfois GET pour tester l'URL). On répond 200 tout de suite et on vérifie en arrière-plan.
  if (path === "/pay/notify") {
    if (request.method === "GET") return new Response("ok");
    let ref = "";
    try {
      const ct = request.headers.get("content-type") || "";
      if (ct.includes("json")) ref = (await request.json())?.cpm_trans_id || "";
      else ref = (await request.formData()).get("cpm_trans_id") || "";
    } catch { /* corps illisible */ }
    if (/^[A-Z0-9]{6,32}$/.test(ref)) ctx.waitUntil(verifyAndApply(env, ref).catch((e) => console.error("verify:", e?.message)));
    return new Response("ok");
  }

  // Retour du client après paiement : on le renvoie vers la page de suivi du site.
  if (path === "/pay/return") {
    const ref = (url.searchParams.get("ref") || "").replace(/[^A-Z0-9]/g, "");
    return Response.redirect(`${siteUrl(env)}/paiement.html${ref ? "?ref=" + ref : ""}`, 303);
  }

  // Statut public d'un paiement (la référence, longue et aléatoire, sert de clé). Aucune donnée personnelle n'est renvoyée.
  if (path === "/pay/status" && request.method === "GET") {
    const ref = (url.searchParams.get("ref") || "").replace(/[^A-Z0-9]/g, "");
    let pay = ref ? await getPayment(env, ref) : null;
    if (!pay) return json(env, { error: "Référence introuvable" }, 404);
    // Le client revient parfois avant la notification : on vérifie sans attendre (au plus toutes les 5 s).
    if (pay.status === "pending" && pay.mode !== "manual" && Date.now() - Date.parse(pay.updated) > 5000) {
      pay = (await verifyAndApply(env, ref).catch(() => pay)) || pay;
      if (pay.status === "pending") await savePayment(env, { ...pay, updated: new Date().toISOString() });
    }
    const manual = pay.mode === "manual";
    return json(env, {
      ref: pay.ref, label: pay.label, amount: pay.amount, currency: pay.currency, status: pay.status, mode: pay.mode || "cinetpay",
      url: pay.status === "pending" && !manual ? pay.url : "", paidAt: pay.paidAt,
      // Les numéros Mobile Money et le RIB ne sont montrés qu'à qui possède la référence, tant que le paiement n'est pas réglé.
      instructions: manual && (pay.status === "pending" || pay.status === "declared") ? { holder: env.MM_HOLDER || "", operators: manualOperators(env), bank: bankInfo(env) || undefined } : undefined,
    });
  }

  return null;
}
