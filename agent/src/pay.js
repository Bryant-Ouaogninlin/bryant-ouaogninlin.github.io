// Paiements via CinetPay (Wave, Orange Money, MTN MoMo, Moov Money, cartes) : on crée un lien, le client paie sur la page
// sécurisée de CinetPay (Kinéo ne voit jamais de numéro de carte ni de code secret), puis CinetPay nous prévient.
// RÈGLE : on ne croit jamais l'appel de notification tel quel. On redemande toujours le statut à CinetPay avant de valider.
import { getPayment, getProject, savePayment, updateProject } from "./store.js";
import { isWindowError, sendTemplate, sendText } from "./whatsapp.js";
import { notifyOwner } from "./notify.js";

const API = "https://api-checkout.cinetpay.com/v2";
const DEFAULT_SITE = "https://bryant-ouaogninlin.github.io";

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
  if (amt % 5 !== 0) return { ok: false, error: "Le montant doit être un multiple de 5 (règle de CinetPay)." };
  if (amt > 5_000_000) return { ok: false, error: "Montant trop élevé : vérifiez le nombre de zéros." };
  if (!env.CINETPAY_API_KEY || !env.CINETPAY_SITE_ID) return { ok: false, error: "CinetPay n'est pas encore configuré (clés manquantes)." };

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
  const pay = { ref, amount: amt, currency: "XOF", label: clean(label), project, wa, name, status: "pending", url, method: "", created: now, updated: now, paidAt: "" };
  await savePayment(env, pay);
  return { ok: true, pay };
}

// Enregistre un paiement reçu hors ligne (espèces, virement, Mobile Money direct).
export async function recordManualPayment(env, { amount, label, wa, name = "", project = "", method = "manuel" }) {
  const now = new Date().toISOString();
  const pay = { ref: newRef(), amount: Number(amount), currency: "XOF", label: clean(label), project, wa, name, status: "paid", url: "", method, created: now, updated: now, paidAt: now };
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
  if (!pay || pay.status === "paid") return pay;
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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  Vary: "Origin",
});
const json = (env, obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors(env) } });

// ---------- routes HTTP ----------
export async function handlePayRoute(request, env, ctx, url) {
  const path = url.pathname;

  if (request.method === "OPTIONS" && path === "/pay/status") return new Response(null, { status: 204, headers: cors(env) });

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
    if (pay.status === "pending" && Date.now() - Date.parse(pay.updated) > 5000) {
      pay = (await verifyAndApply(env, ref).catch(() => pay)) || pay;
      if (pay.status === "pending") await savePayment(env, { ...pay, updated: new Date().toISOString() });
    }
    return json(env, { ref: pay.ref, label: pay.label, amount: pay.amount, currency: pay.currency, status: pay.status, url: pay.status === "pending" ? pay.url : "", paidAt: pay.paidAt });
  }

  return null;
}
