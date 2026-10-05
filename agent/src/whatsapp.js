// WhatsApp Cloud API (Meta) : vérification de signature, lecture des messages entrants, envoi.

const GRAPH = "https://graph.facebook.com/v21.0";

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Meta signe chaque appel avec l'APP_SECRET : sans cela, n'importe qui pourrait écrire à l'agent et vider le budget.
export async function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  let diff = 0; // comparaison à temps constant
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// Extrait les messages d'un appel webhook : [{ id, from, name, type, text }]
export function parseIncoming(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value?.messages) continue;
      const names = {};
      for (const c of value.contacts ?? []) names[c.wa_id] = c.profile?.name ?? "";
      for (const m of value.messages) {
        let text = null;
        if (m.type === "text") text = m.text?.body ?? "";
        else if (m.type === "button") text = m.button?.text ?? "";
        else if (m.type === "interactive") text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        out.push({ id: m.id, from: m.from, name: names[m.from] ?? "", type: m.type, text });
      }
    }
  }
  return out;
}

async function graph(env, path, payload) {
  const res = await (env.FETCH ?? fetch)(`${GRAPH}/${env.WHATSAPP_PHONE_ID}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (res.ok) return { ok: true };
  let code = null;
  try { code = (await res.json())?.error?.code ?? null; } catch { /* corps vide */ }
  console.error(`WhatsApp ${path} a échoué : HTTP ${res.status}, code ${code}`);
  return { ok: false, status: res.status, code };
}

export function markRead(env, messageId) {
  return graph(env, "messages", { status: "read", message_id: messageId });
}

// WhatsApp limite un message à 4096 caractères : on coupe proprement aux paragraphes.
export function splitText(text, max = 3800) {
  const parts = [];
  let rest = String(text).trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendText(env, to, text) {
  let last = { ok: true };
  for (const part of splitText(text)) {
    last = await graph(env, "messages", { to, type: "text", text: { preview_url: false, body: part } });
    if (!last.ok) return last;
  }
  return last;
}

// Hors de la fenêtre de 24 h après le dernier message du client, WhatsApp n'accepte qu'un modèle de message pré-approuvé.
export function sendTemplate(env, to, name, params = [], lang = "fr") {
  return graph(env, "messages", {
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: params.length ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: String(p).slice(0, 200) })) }] : [],
    },
  });
}

// Code d'erreur Meta « hors fenêtre de conversation » (131047) ou « conversation non initiée » (131026/470).
export const isWindowError = (r) => !r.ok && [131047, 131026, 470].includes(r.code);

// Normalise un numéro saisi à la main : « 05 05 48 34 81 » (10 chiffres ivoiriens) → 2250505483481
export function normalizeNumber(input) {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("0")) return "225" + d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}
