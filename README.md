# Comptage Palettes – atelier brumes parfumées

Application web (mobile) pour fiabiliser le comptage des caisses produites par SKU.

## Principe

1. **Fin de palette** : l'opérateur choisit le SKU et prend une photo de la palette avec le téléphone/tablette.
2. **Comptage IA** : Claude (vision) compte les couches et les caisses de la couche du dessus,
   selon le plan de palettisation du SKU (ex. 20 caisses × 7 couches = 140 = palette pleine).
3. **Validation opérateur** : le nombre proposé est confirmé ou corrigé (boutons +/−, « Palette pleine », calcul couches).
   Chaque correction est tracée (écart IA / opérateur).
4. **Bilan du jour** : caisses, palettes pleines/partielles par SKU, photos de preuve, export CSV pour Excel.

## Mise en ligne sur Render (recommandé)

L'appli est accessible depuis n'importe quel téléphone (Wi-Fi ou 4G), en HTTPS, sans PC dans l'atelier.

1. Créer un compte sur https://render.com (connexion avec GitHub) et ajouter un moyen de paiement.
2. **New → Blueprint** → choisir le dépôt `sahraoui` → Render lit `render.yaml`.
3. Renseigner les 3 valeurs demandées :
   - `ANTHROPIC_API_KEY` : clé API (console.anthropic.com)
   - `ACCESS_CODE` : code des opérateurs (ex. 6 chiffres)
   - `ADMIN_CODE` : code du responsable (différent, plus long)
4. **Apply**. Après 2–3 min, l'adresse s'affiche (ex. `https://comptage-palettes.onrender.com`).
5. Sur chaque téléphone : ouvrir l'adresse → saisir le code → menu du navigateur → **Ajouter à l'écran d'accueil**.

**Droits**
- Code opérateur : saisie des palettes, consultation du bilan, export.
- Code responsable : en plus, onglet Réglages (SKU, palette pleine) et suppression de palettes.

**Exploitation**
- Fuseau horaire : `TZ` dans `render.yaml` (par défaut `Europe/Paris`) – à adapter au pays de l'atelier (ex. `Africa/Algiers`, `Africa/Casablanca`, `Africa/Tunis`).
- Changer un code : Render → service → Environment → modifier → Save (redémarrage automatique). Les téléphones devront ressaisir le code.
- Sauvegarde : Render fait des instantanés automatiques du disque (voir Render → Disks). Exporter aussi le bilan CSV chaque jour.
- Chaque mise à jour fusionnée sur `main` est redéployée automatiquement.
- Coût indicatif : offre Starter (~7 $/mois) + disque 1 Go (~0,25 $/mois) + IA à la photo.

## Variante : installation sur un PC de l'atelier (Windows)

1. Installer **Node.js LTS** (version 22 ou plus) : https://nodejs.org → bouton « LTS » → installer avec les options par défaut.
2. Télécharger l'appli : sur GitHub, bouton **Code → Download ZIP**, puis extraire dans `C:\ComptagePalettes`.
3. Double-cliquer sur **`demarrer.bat`**. Au premier lancement, il installe les composants (1–2 min) et crée le fichier `.env`.
4. Ouvrir `.env` avec le Bloc-notes et coller la clé API après `ANTHROPIC_API_KEY=`. Enregistrer, fermer la fenêtre noire, relancer `demarrer.bat`.
   La fenêtre doit afficher « IA : claude-opus-5-5 » (sinon : mode démo).
5. Au premier lancement, Windows demande d'autoriser Node.js sur le réseau : cocher **Réseaux privés** → Autoriser.
6. Trouver l'adresse IP du PC : touche Windows → `cmd` → taper `ipconfig` → ligne « Adresse IPv4 » (ex. `192.168.1.20`).
7. Sur les téléphones (même Wi-Fi que le PC) : ouvrir `http://192.168.1.20:3000` puis menu du navigateur → **Ajouter à l'écran d'accueil**.

**Conseils d'exploitation**
- Demander au service informatique une **IP fixe** pour le PC, sinon l'adresse peut changer.
- **Démarrage automatique** : touche Windows + R → `shell:startup` → y placer un raccourci vers `demarrer.bat`.
- Régler le PC pour qu'il **ne se mette pas en veille**.
- **Sauvegarde** : copier le dossier `data` (base + photos) chaque semaine, par exemple sur le réseau.
- Ne pas fermer la fenêtre noire pendant la production : c'est le serveur.

## Démarrage (Linux / Mac)

```bash
npm install
cp .env.example .env    # renseigner ANTHROPIC_API_KEY
npm start
```

Sans clé API, l'appli tourne en **mode démo** (résultats simulés) pour tester le parcours.

## Réglages

Onglet ⚙️ : nombre de caisses d'une palette pleine (140 par défaut) et liste des SKU
(code, désignation, caisses/couche, nombre de couches).

## Données

- `data/db.json` : SKU, palettes (date, n°, SKU, caisses, résultat IA, opérateur, ligne, lot)
- `data/photos/` : photo de chaque palette (preuve en cas d'écart)

## Bonnes pratiques photo

Photo en hauteur, de biais, montrant le **dessus et deux faces**, palette entière dans le cadre, bon éclairage.
