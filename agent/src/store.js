// Mémoire de l'agent dans Cloudflare KV : conversations, demandes, projets, mode « humain ».
// Le KV est « à cohérence éventuelle » : parfait ici, car une conversation WhatsApp est lente à l'échelle du KV.

const MAX_HISTORY = 30; // derniers messages gardés par conversation
const j = (v) => JSON.stringify(v);

async function getJSON(env, key, fallback = null) {
  const raw = await env.KV.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

// ---------- anti-doublon et anti-abus ----------
export async function seenBefore(env, messageId) {
  const key = `seen:${messageId}`;
  if (await env.KV.get(key)) return true;
  await env.KV.put(key, "1", { expirationTtl: 86400 });
  return false;
}

export async function rateLimited(env, from, limit = 15) {
  const key = `rl:${from}:${Math.floor(Date.now() / 60000)}`;
  const n = Number((await env.KV.get(key)) ?? 0) + 1;
  await env.KV.put(key, String(n), { expirationTtl: 120 });
  return n > limit;
}

// ---------- conversations ----------
export const getConv = (env, wa) => getJSON(env, `conv:${wa}`, { name: "", messages: [] });

export async function saveConv(env, wa, conv) {
  let msgs = conv.messages.slice(-MAX_HISTORY);
  while (msgs.length && msgs[0].role !== "user") msgs = msgs.slice(1); // l'API exige de commencer par un message client
  await env.KV.put(`conv:${wa}`, j({ ...conv, messages: msgs }), { expirationTtl: 60 * 60 * 24 * 90 });
}

// ---------- mode humain ----------
export const isHuman = async (env, wa) => (await env.KV.get(`human:${wa}`)) === "1";
export const setHuman = (env, wa, on) => (on ? env.KV.put(`human:${wa}`, "1") : env.KV.delete(`human:${wa}`));

// ---------- demandes (leads) ----------
export async function saveLead(env, wa, patch) {
  const prev = await getJSON(env, `lead:${wa}`, { wa, created: new Date().toISOString() });
  const lead = { ...prev, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null && v !== "")), wa, updated: new Date().toISOString() };
  await env.KV.put(`lead:${wa}`, j(lead));
  const idx = (await getJSON(env, "leads:index", [])).filter((x) => x !== wa);
  idx.unshift(wa);
  await env.KV.put("leads:index", j(idx.slice(0, 200)));
  return { lead, isNew: !prev.updated };
}

export const getLead = (env, wa) => getJSON(env, `lead:${wa}`);

export async function listLeads(env, n = 10) {
  const idx = await getJSON(env, "leads:index", []);
  const leads = [];
  for (const wa of idx.slice(0, n)) leads.push(await getLead(env, wa));
  return leads.filter(Boolean);
}

// ---------- projets ----------
export async function createProject(env, { wa, name, type, title }) {
  const n = Number((await env.KV.get("proj:counter")) ?? 0) + 1;
  await env.KV.put("proj:counter", String(n));
  const code = `K-${String(n).padStart(3, "0")}`;
  const now = new Date().toISOString();
  const proj = { code, wa, name: name || "", type: type || "", title: title || "", etape: "discussion", note: "", created: now, updated: now };
  await env.KV.put(`proj:${code}`, j(proj));
  const idx = await getJSON(env, "proj:index", []);
  idx.unshift(code);
  await env.KV.put("proj:index", j(idx));
  const own = await getJSON(env, `pw:${wa}`, []);
  own.unshift(code);
  await env.KV.put(`pw:${wa}`, j(own));
  return proj;
}

export const getProject = (env, code) => getJSON(env, `proj:${String(code).toUpperCase()}`);

export async function updateProject(env, code, patch) {
  const proj = await getProject(env, code);
  if (!proj) return null;
  const next = { ...proj, ...patch, updated: new Date().toISOString() };
  await env.KV.put(`proj:${proj.code}`, j(next));
  return next;
}

export async function projectsFor(env, wa) {
  const codes = await getJSON(env, `pw:${wa}`, []);
  const out = [];
  for (const c of codes) out.push(await getProject(env, c));
  return out.filter(Boolean);
}

export async function listProjects(env, n = 15) {
  const idx = await getJSON(env, "proj:index", []);
  const out = [];
  for (const c of idx.slice(0, n)) out.push(await getProject(env, c));
  return out.filter(Boolean);
}

// ---------- demandes de rappel ----------
export async function saveCallback(env, wa, data) {
  const id = `cb:${Date.now()}`;
  await env.KV.put(id, j({ wa, ...data, created: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 30 });
  return id;
}
