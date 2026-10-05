// Configuration publique du site (aucun secret ici : ce fichier est lisible par tout le monde).
// Une fois l'agent déployé sur Cloudflare, renseignez son adresse pour activer la page de paiement :
//   window.KINEO = { api: "https://kineo-agent.votre-nom.workers.dev", mode: "manual" };
// mode : "manual" (Mobile Money et virement, vous confirmez à la main) ou "cinetpay" (lien de paiement en ligne).
window.KINEO = { api: "", mode: "manual" };
