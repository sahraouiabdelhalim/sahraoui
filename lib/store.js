// Stockage simple en fichier JSON (suffisant pour un atelier : quelques centaines de palettes/jour).
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PHOTO_DIR = path.join(DATA_DIR, "photos");

fs.mkdirSync(PHOTO_DIR, { recursive: true });

const DEFAULT_DB = {
  settings: { fullPalletCases: 140 },
  skus: [
    // Exemple : palette de 140 caisses = 7 couches x 20 caisses
    { code: "BRUME-100-ROSE", name: "Brume parfumée Rose 100 ml", casesPerLayer: 20, layers: 7, active: true },
  ],
  pallets: [],
};

function load() {
  if (!fs.existsSync(DB_FILE)) return structuredClone(DEFAULT_DB);
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

let db = load();

function save() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // écriture atomique
}

function savePhoto(id, base64Jpeg) {
  const file = `${id}.jpg`;
  fs.writeFileSync(path.join(PHOTO_DIR, file), Buffer.from(base64Jpeg, "base64"));
  return file;
}

module.exports = { get db() { return db; }, save, savePhoto, PHOTO_DIR };
