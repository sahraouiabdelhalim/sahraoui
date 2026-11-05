# Comptage Palettes – atelier brumes parfumées

Application web (mobile) pour fiabiliser le comptage des caisses produites par SKU.

## Principe

1. **Fin de palette** : l'opérateur choisit le SKU et prend une photo de la palette avec le téléphone/tablette.
2. **Comptage IA** : Claude (vision) compte les couches et les caisses de la couche du dessus,
   selon le plan de palettisation du SKU (ex. 20 caisses × 7 couches = 140 = palette pleine).
3. **Validation opérateur** : le nombre proposé est confirmé ou corrigé (boutons +/−, « Palette pleine », calcul couches).
   Chaque correction est tracée (écart IA / opérateur).
4. **Bilan du jour** : caisses, palettes pleines/partielles par SKU, photos de preuve, export CSV pour Excel.

## Démarrage

```bash
npm install
cp .env.example .env    # renseigner ANTHROPIC_API_KEY
export $(cat .env | xargs) && npm start
```

Ouvrir `http://<IP-du-poste>:3000` sur le téléphone de l'atelier (même réseau Wi-Fi).
Sans clé API, l'appli tourne en **mode démo** (résultats simulés) pour tester le parcours.

> L'appareil photo du navigateur exige HTTPS hors `localhost` sur certains téléphones ;
> sinon le bouton ouvre la galerie. Pour la production, placer l'appli derrière un reverse proxy HTTPS.

## Réglages

Onglet ⚙️ : nombre de caisses d'une palette pleine (140 par défaut) et liste des SKU
(code, désignation, caisses/couche, nombre de couches).

## Données

- `data/db.json` : SKU, palettes (date, n°, SKU, caisses, résultat IA, opérateur, ligne, lot)
- `data/photos/` : photo de chaque palette (preuve en cas d'écart)

## Bonnes pratiques photo

Photo en hauteur, de biais, montrant le **dessus et deux faces**, palette entière dans le cadre, bon éclairage.
