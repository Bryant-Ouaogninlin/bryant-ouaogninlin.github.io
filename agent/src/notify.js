// Prévenir le propriétaire sur son WhatsApp.
import { sendTemplate, sendText } from "./whatsapp.js";

export async function notifyOwner(env, text) {
  if (!env.OWNER_NUMBER) return;
  const r = await sendText(env, env.OWNER_NUMBER, text);
  // Hors fenêtre de 24 h, seul un modèle pré-approuvé passe : voir README (TEMPLATE_OWNER_ALERT).
  if (!r.ok && env.TEMPLATE_OWNER_ALERT) await sendTemplate(env, env.OWNER_NUMBER, env.TEMPLATE_OWNER_ALERT, [text.slice(0, 180)]);
}
