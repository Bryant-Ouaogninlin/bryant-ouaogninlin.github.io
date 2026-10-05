// Commandes réservées au propriétaire : il pilote l'agent depuis son propre WhatsApp.
import { FACTS, etapeLabel } from "./config.js";
import { createProject, getProject, listLeads, listPayments, listProjects, projectsFor, setHuman, updateProject } from "./store.js";
import { createPayment, fmtFcfa, payLink, recordManualPayment } from "./pay.js";
import { isWindowError, normalizeNumber, sendTemplate, sendText } from "./whatsapp.js";

const AIDE = `Commandes Kinéo

/clients : les 10 dernières demandes
/projets : les projets en cours
/nouveau 05 05 48 34 81 | Prénom | site | Titre du projet : crée un projet (type : site, video, digital)
/etape K-001 proposition | message pour le client (facultatif) : change l'étape et prévient le client
   étapes : discussion, proposition, ajustements, livraison, termine
/note K-001 texte : note interne (non visible du client)
/paiement K-001 50000 | acompte : crée un lien de paiement (montant multiple de 5) et l'envoie au client
/paiement 2250505483481 25000 | Retouches : idem pour un client sans projet
/paiements : les 10 derniers paiements
/paye K-001 25000 | espèces : enregistre un paiement reçu hors ligne
/prendre 225XXXXXXXXXX : l'agent se tait pour ce client
/reprendre 225XXXXXXXXXX : l'agent reprend
/dire 225XXXXXXXXXX message : envoie un message au client`;

const fmtDate = (iso) => (iso ? iso.slice(0, 10) : "");

export async function handleOwnerCommand(env, text, request) {
  const trimmed = text.trim();
  const sp = trimmed.search(/\s/);
  const cmd = (sp === -1 ? trimmed : trimmed.slice(0, sp)).toLowerCase();
  const arg = sp === -1 ? "" : trimmed.slice(sp + 1).trim();

  switch (cmd) {
    case "/aide":
    case "/help":
      return AIDE;

    case "/clients": {
      const leads = await listLeads(env, 10);
      if (!leads.length) return "Aucune demande pour l'instant.";
      return leads.map((l) => `${l.name || "Sans nom"} (+${l.wa}) — ${l.type || "?"} — ${l.description || ""} — ${fmtDate(l.updated)}`).join("\n\n");
    }

    case "/projets": {
      const ps = await listProjects(env, 15);
      if (!ps.length) return "Aucun projet pour l'instant. Créez-en un avec /nouveau.";
      return ps.map((p) => `${p.code} — ${p.name || "?"} — ${p.title || p.type} — ${etapeLabel(p.etape)}`).join("\n");
    }

    case "/nouveau": {
      const [num, name, type, ...title] = arg.split("|").map((s) => s.trim());
      const wa = normalizeNumber(num);
      if (!wa) return "Numéro non reconnu. Exemple : /nouveau 05 05 48 34 81 | Awa | site | Site de mariage";
      if (!["site", "video", "digital"].includes((type || "").toLowerCase())) return "Type à choisir parmi : site, video, digital.";
      const p = await createProject(env, { wa, name, type: type.toLowerCase(), title: title.join(" | ") });
      return `Projet ${p.code} créé pour ${name || "ce client"} (+${wa}). Étape : ${etapeLabel(p.etape)}. Le client le retrouvera en demandant « où en est mon projet ? ».`;
    }

    case "/etape": {
      const [head, ...rest] = arg.split("|");
      const [code, step] = head.trim().split(/\s+/);
      const proj = code ? await getProject(env, code) : null;
      if (!proj) return "Projet introuvable. Voir /projets.";
      const known = FACTS.etapes.find((e) => e.code === (step || "").toLowerCase());
      if (!known) return `Étape inconnue. Choisissez : ${FACTS.etapes.map((e) => e.code).join(", ")}.`;
      const note = rest.join("|").trim();
      await updateProject(env, proj.code, { etape: known.code, note: note || proj.note });
      const body = `Bonjour${proj.name ? " " + proj.name : ""}, votre projet ${proj.title ? "« " + proj.title + " » " : ""}(${proj.code}) est maintenant à l'étape : ${known.label}. ${known.detail}${note ? "\n\n" + note : ""}`;
      let r = await sendText(env, proj.wa, body);
      let how = "message envoyé";
      if (isWindowError(r) && env.TEMPLATE_PROJECT_UPDATE) {
        r = await sendTemplate(env, proj.wa, env.TEMPLATE_PROJECT_UPDATE, [proj.name || "", proj.title || proj.code, known.label]);
        how = "modèle de message envoyé";
      }
      return r.ok
        ? `${proj.code} passé à « ${known.label} » ; ${how} au client.`
        : `${proj.code} passé à « ${known.label} », mais le client n'a pas pu être prévenu (il n'a pas écrit depuis plus de 24 h et aucun modèle de message n'est configuré). Il verra l'étape en demandant à l'agent.`;
    }

    case "/paiement":
    case "/paye": {
      const [head, ...lab] = arg.split("|");
      const [who, amountRaw] = head.trim().split(/\s+/);
      const amount = Number(String(amountRaw || "").replace(/[^\d]/g, ""));
      const label = lab.join("|").trim() || "Prestation Kinéo";
      if (!who || !amount) return `Exemple : ${cmd} K-001 50000 | acompte`;
      let wa, name = "", project = "", pLabel = label;
      if (/^k-\d+$/i.test(who)) {
        const proj = await getProject(env, who);
        if (!proj) return "Projet introuvable. Voir /projets.";
        wa = proj.wa; name = proj.name; project = proj.code;
        pLabel = `${label}${proj.title ? " — " + proj.title : ""}`;
      } else {
        wa = normalizeNumber(who);
        if (!wa) return "Numéro ou code projet non reconnu.";
      }
      if (cmd === "/paye") {
        const p = await recordManualPayment(env, { amount, label: pLabel, wa, name, project, method: "hors ligne" });
        return `Paiement de ${fmtFcfa(amount)} enregistré (${p.ref}) ; le client est remercié.`;
      }
      const r = await createPayment(env, request, { amount, label: pLabel, wa, name, project });
      if (!r.ok) return r.error;
      const link = payLink(env, r.pay.ref);
      const msg = `Bonjour${name ? " " + name : ""}, voici votre lien de paiement sécurisé pour ${pLabel} : ${fmtFcfa(amount)}.\n${link}\nVous pouvez payer avec Wave, Orange Money, MTN MoMo, Moov Money ou carte bancaire.`;
      let sent = await sendText(env, wa, msg);
      if (isWindowError(sent) && env.TEMPLATE_PAYMENT_LINK) sent = await sendTemplate(env, wa, env.TEMPLATE_PAYMENT_LINK, [name || "", fmtFcfa(amount), link]);
      return `${r.pay.ref} créé : ${fmtFcfa(amount)} pour ${pLabel}.\nLien : ${link}\n` + (sent.ok ? "Envoyé au client." : "Le client n'a pas pu être prévenu (plus de 24 h sans message) : transmettez-lui le lien vous-même.");
    }

    case "/paiements": {
      const ps = await listPayments(env, 10);
      if (!ps.length) return "Aucun paiement pour l'instant.";
      const st = { pending: "en attente", paid: "payé", failed: "échoué" };
      return ps.map((p) => `${p.ref} — ${fmtFcfa(p.amount)} — ${p.label} — ${st[p.status] || p.status}`).join("\n");
    }

    case "/note": {
      const [code, ...t] = arg.split(/\s+/);
      const proj = code ? await getProject(env, code) : null;
      if (!proj) return "Projet introuvable. Voir /projets.";
      await updateProject(env, proj.code, { note: t.join(" ") });
      return `Note enregistrée sur ${proj.code}. L'agent pourra la répéter au client si celui-ci demande des nouvelles.`;
    }

    case "/prendre":
    case "/reprendre": {
      const wa = normalizeNumber(arg);
      if (!wa) return `Numéro non reconnu. Exemple : ${cmd} 2250505483481`;
      await setHuman(env, wa, cmd === "/prendre");
      return cmd === "/prendre" ? `L'agent se tait pour +${wa}. Ses messages vous seront transmis ici.` : `L'agent reprend la conversation avec +${wa}.`;
    }

    case "/dire": {
      const [num, ...msg] = arg.split(/\s+/);
      const wa = normalizeNumber(num);
      if (!wa || !msg.length) return "Exemple : /dire 2250505483481 Bonjour, voici votre maquette.";
      const r = await sendText(env, wa, msg.join(" "));
      return r.ok ? `Message envoyé à +${wa}.` : "Envoi impossible : le client n'a pas écrit depuis plus de 24 h (limite de WhatsApp).";
    }

    default:
      return "Commande inconnue. Envoyez /aide pour la liste.";
  }
}

// Les projets d'un client, utile pour les tests et pour l'admin web.
export { projectsFor };
