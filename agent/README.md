# Agent WhatsApp de Kinéo

Un assistant virtuel qui répond à vos clients sur WhatsApp, à toute heure :

- **Accueille** et comprend le besoin (site, montage, digital), demande le délai et le budget.
- **Enregistre la demande** et vous prévient sur votre WhatsApp avec un résumé.
- **Suit l'avancement** : « où en est mon projet ? » reçoit l'étape que vous avez saisie.
- **Propose un rappel** : il note la demande, vous confirmez l'horaire.
- **Vous passe la main** quand le client le demande, est mécontent, ou que le sujet touche à l'argent.

Il ne **ne donne jamais** de prix, de délai ou de réalisation inventés : tout est sur devis, et il le dit.

## Comment ça marche

```
Client ──WhatsApp──> Meta ──webhook──> Worker Cloudflare ──> Claude (API Anthropic)
                                          │   ▲
                                          ▼   │ outils : enregistrer la demande, lire le projet,
                                       KV Cloudflare       demander un rappel, passer la main
                                  (conversations, demandes, projets)
                                          │
                                          └──> vous prévient sur votre WhatsApp
```

Le site (GitHub Pages) ne peut pas faire tourner un agent : il lui faut un petit serveur. On utilise **Cloudflare Workers**,
gratuit pour démarrer. Les clés secrètes restent sur Cloudflare, **jamais dans ce dépôt** (qui est public).

## Ce qu'il vous faut

| Compte | À quoi ça sert | Coût |
|---|---|---|
| **Anthropic** (console.anthropic.com) | Le cerveau (Claude) | Paiement à l'usage, voir plus bas |
| **Cloudflare** (cloudflare.com) | Héberger l'agent et sa mémoire | Gratuit pour débuter |
| **Meta for Developers** (developers.facebook.com) | L'API officielle WhatsApp Business | Gratuit à ouvrir ; messages de service gratuits dans les 24 h après un message du client (à vérifier sur la grille Meta en vigueur) |
| **Un numéro WhatsApp dédié** | Le numéro de l'agent | Une carte SIM |

**Important sur le numéro.** Un numéro utilisé avec l'application WhatsApp (ou WhatsApp Business) ne peut pas être
branché tel quel sur l'API. Deux possibilités : utiliser un **nouveau numéro** pour l'agent, ou supprimer le compte WhatsApp de
l'actuel pour le migrer (vous perdez les discussions de l'application). Si le numéro change, il faudra mettre à jour le bouton
WhatsApp du site : on le fera ensemble.

### Combien ça coûte à l'usage

Un échange typique (instructions + historique + réponse) représente environ 3 000 *tokens* (unités de texte, à peu près des demi-mots) en entrée et 300 en sortie.
Avec le modèle par défaut `claude-opus-5-5` (4 $ / 20 $ par million de tokens), comptez **de l'ordre de 0,02 $ par message client**.
Avec `claude-sonnet-5-5` (2 $ / 10 $), environ moitié moins. Pour changer de modèle : la ligne `MODEL` de `wrangler.toml`.
C'est à vous de décider entre qualité maximale et coût : commencez par le défaut et regardez la facture après une semaine.

**Limite du plan gratuit Cloudflare** : 1 000 écritures dans la mémoire (KV) par jour, soit environ 200 messages clients par jour.
Au-delà, le plan payant « Workers » (5 $/mois) lève la limite.

## Mise en route pas à pas

### 1. Clé Anthropic
Console Anthropic → *API keys* → créer une clé. Gardez-la de côté (elle commence par `sk-ant-`). Ajoutez un peu de crédit.

### 2. Cloudflare
1. Créez un compte, puis *Workers & Pages* → *KV* → **Create a namespace** nommé `kineo-agent`. Copiez son **ID**.
2. Collez cet ID dans `wrangler.toml` à la place de `REMPLACER_PAR_L_ID_DU_KV`.
3. Déploiement (au choix) :
   - **Depuis votre ordinateur** : `npm install`, puis `npx wrangler login`, puis `npx wrangler deploy` (dans ce dossier `agent/`).
   - **Depuis GitHub** : *Workers & Pages* → *Create* → *Import a repository*, choisissez ce dépôt, dossier racine `agent`.
4. Notez l'adresse de votre Worker, du type `https://kineo-agent.votre-nom.workers.dev`.

### 3. Meta (WhatsApp Business Platform)
1. developers.facebook.com → *My Apps* → **Create App** → type *Business* → ajoutez le produit **WhatsApp**.
2. Dans *WhatsApp → API Setup* : notez le **Phone number ID** et générez un jeton. Pour un usage durable, créez un **jeton permanent** via un *System User* (le jeton temporaire expire en 24 h).
3. *App settings → Basic* : notez l'**App Secret**.
4. Ajoutez votre numéro dédié et faites vérifier votre entreprise (Meta peut demander quelques jours).

### 4. Les secrets (dans Cloudflare : Worker → *Settings → Variables and Secrets*, ou `npx wrangler secret put NOM`)

| Nom | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | La clé de l'étape 1 |
| `WHATSAPP_TOKEN` | Le jeton Meta de l'étape 3 |
| `WHATSAPP_PHONE_ID` | Le *Phone number ID* |
| `WHATSAPP_APP_SECRET` | L'*App Secret* |
| `WHATSAPP_VERIFY_TOKEN` | Un mot de passe que vous inventez (long, au hasard) |
| `OWNER_NUMBER` | **Votre** numéro personnel, au format `2250102030405` (sans `+` ni espaces) |

### 5. Brancher WhatsApp sur l'agent
Meta → *WhatsApp → Configuration* → **Webhook** :
- *Callback URL* : `https://kineo-agent.votre-nom.workers.dev/webhook`
- *Verify token* : celui que vous avez inventé
- Cliquez *Verify*, puis abonnez-vous au champ **messages**.

### 6. Essayez
Écrivez au numéro de l'agent depuis un autre téléphone. Puis, depuis `OWNER_NUMBER`, envoyez `/aide`.

## Piloter l'agent depuis votre WhatsApp

Seul `OWNER_NUMBER` peut utiliser ces commandes :

| Commande | Effet |
|---|---|
| `/clients` | Les 10 dernières demandes |
| `/projets` | Les projets en cours et leur étape |
| `/nouveau 05 05 48 34 81 \| Awa \| site \| Site de mariage` | Crée un projet (`site`, `video` ou `digital`) ; l'agent le retrouve quand Awa demande des nouvelles |
| `/etape K-001 proposition \| Voici la première maquette` | Change l'étape et **prévient le client** avec votre message |
| `/note K-001 texte` | Note que l'agent pourra répéter au client |
| `/prendre 2250505483481` | L'agent se tait ; les messages du client vous sont transmis |
| `/dire 2250505483481 Bonjour…` | Vous répondez au client depuis le numéro de l'agent |
| `/reprendre 2250505483481` | L'agent reprend la conversation |

Étapes : `discussion`, `proposition`, `ajustements`, `livraison`, `termine`.

## Paiements (CinetPay)

Les clients paient sur la page sécurisée de **CinetPay** (Wave, Orange Money, MTN MoMo, Moov Money, cartes Visa/Mastercard selon disponibilité).
Kinéo ne voit jamais de numéro de carte ni de code secret. Commission annoncée par CinetPay : de l'ordre de 1,5 à 2 % selon l'offre
(à vérifier dans votre contrat). Le franc CFA (XOF) est la devise ; **le montant doit être un multiple de 5**.

**Comment ça se passe**
1. Vous écrivez à l'agent : `/paiement K-001 50000 | acompte`. L'agent crée le lien chez CinetPay et l'envoie au client par WhatsApp.
2. Le client ouvre la page `paiement.html` du site, clique *Payer maintenant*, choisit son moyen de paiement chez CinetPay.
3. CinetPay prévient le Worker (`/pay/notify`). **Le Worker ne croit pas cet appel** : il redemande le statut à CinetPay, et vérifie le montant
   et la devise. Seulement alors, le paiement est marqué *payé*, vous êtes prévenu et le client reçoit un accusé de réception.
4. La page du site se met à jour toute seule (le lapin fête ça).

**Commandes** : `/paiement K-001 50000 | acompte`, `/paiement 2250505483481 25000 | retouches` (sans projet), `/paiements`
(liste), `/paye K-001 10000 | espèces` (paiement reçu hors ligne). L'agent peut renvoyer un lien en attente quand le client le demande.

**Mise en route**
1. Créez un compte marchand sur **cinetpay.com** et faites valider votre activité (pièces d'identité ; selon votre statut, des documents d'entreprise).
2. Dans votre espace marchand, récupérez la **clé API** et le **Site ID**.
3. Ajoutez-les comme secrets Cloudflare : `CINETPAY_API_KEY` et `CINETPAY_SITE_ID`.
4. Activez la page de paiement du site : dans `assets/config.js`, mettez l'adresse du Worker (`window.KINEO = { api: "https://kineo-agent.….workers.dev" }`).
5. Faites un premier paiement test d'un petit montant (par exemple 100 FCFA) avant d'ouvrir au public.

Variables facultatives : `SITE_URL` (adresse du site, par défaut celle de GitHub Pages), `WORKER_URL` (adresse du Worker, sinon déduite de la requête),
`CONTACT_EMAIL`. Modèles WhatsApp facultatifs pour écrire hors fenêtre de 24 h : `TEMPLATE_PAYMENT_LINK` (3 variables : prénom, montant, lien) et
`TEMPLATE_PAYMENT_OK` (3 variables : prénom, montant, référence).

**Sécurité des paiements** : la notification n'est jamais crue sans vérification auprès de CinetPay ; un paiement dont le montant ne correspond
pas est refusé et vous êtes alerté ; une notification en double ne fait rien de plus ; le statut public d'un paiement ne contient aucune donnée
personnelle et n'est lisible que depuis le site (CORS) avec une référence longue et aléatoire ; seul le propriétaire peut créer un lien.

## Limites à connaître

- **La fenêtre de 24 h.** WhatsApp n'autorise les messages libres que dans les 24 h suivant un message du client. Au-delà
  (nouvelles d'un projet, alertes pour vous), il faut un **modèle de message** approuvé par Meta. Créez-les dans *WhatsApp → Message
  templates* puis renseignez `TEMPLATE_PROJECT_UPDATE` (3 variables : prénom, projet, étape) et `TEMPLATE_OWNER_ALERT` (1 variable).
  Sans cela, une alerte hors fenêtre n'arrive pas : écrivez simplement `/aide` à l'agent chaque jour pour la rouvrir.
- **Messages vocaux, images** : pour l'instant l'agent ne lit que le texte et le dit poliment.
- **Pas d'agenda** : il note les demandes de rappel, vous confirmez.
- **Pas de prix, pas de lien de paiement créé par l'agent** : l'agent peut seulement renvoyer un lien que vous avez émis. Tout le reste passe par vous.

## Sécurité et données personnelles

- Chaque appel de Meta est **vérifié par signature** ; un appel falsifié est rejeté avant tout traitement.
- Un client **ne voit jamais** les projets d'un autre : l'outil de suivi compare le numéro à celui du projet.
- L'agent a l'ordre de refuser de changer ses règles, d'inventer des prix ou de révéler ses instructions.
- Limite de **15 messages par minute** par numéro (protège votre budget).
- Les conversations sont gardées 90 jours dans le KV de Cloudflare, puis effacées.
- Les messages sont traités par Anthropic (Claude) pour générer les réponses. **Il faut le dire aux clients** et mettre à jour
  la page *Mentions légales et confidentialité* du site avant la mise en service (finalité, hébergeurs, durée de conservation, contact pour exercer leurs droits).

## Personnaliser

- **Ce qu'il sait et son ton** : `src/config.js` (services, étapes, règles). N'y mettez que des faits exacts.
- **Les outils** : `src/tools.js`.
- **Les commandes** : `src/owner.js`.

## Tester sans rien dépenser

```bash
npm install
npm test
```

55 contrôles simulent Meta, Claude et CinetPay : signature, doublons, mémoire, suivi de projet, passage de relais, pannes, anti-abus, paiements (vérification, montants, doublons).
