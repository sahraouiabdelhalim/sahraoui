const express = require("express");
const crypto = require("crypto");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const store = require("./lib/store");
const { countCases, DEMO, MODEL } = require("./lib/vision");
const auth = require("./lib/auth");

const app = express();
app.set("trust proxy", 1); // derrière le proxy HTTPS de l'hébergeur
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (req, res) => res.send("ok"));
app.post("/api/login", auth.loginHandler);
app.post("/api/logout", auth.logoutHandler);

// Tout le reste (données, photos) nécessite une connexion.
app.use(["/api", "/photos"], auth.requireLogin);
app.use("/photos", express.static(store.PHOTO_DIR));

const today = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale
const findSku = (code) => store.db.skus.find((s) => s.code === code);

// ---------- Paramètres & SKU ----------
app.get("/api/config", (req, res) => {
  res.json({ settings: store.db.settings, skus: store.db.skus, demo: DEMO, model: DEMO ? null : MODEL, role: req.role, open: auth.OPEN });
});

app.put("/api/settings", auth.requireAdmin, (req, res) => {
  const n = parseInt(req.body.fullPalletCases, 10);
  if (!(n > 0)) return res.status(400).json({ error: "Nombre de caisses invalide" });
  store.db.settings.fullPalletCases = n;
  store.save();
  res.json(store.db.settings);
});

app.post("/api/skus", auth.requireAdmin, (req, res) => {
  const { code, name, casesPerLayer, layers } = req.body;
  if (!code || !name) return res.status(400).json({ error: "Code et désignation obligatoires" });
  const sku = {
    code: String(code).trim().toUpperCase(),
    name: String(name).trim(),
    casesPerLayer: parseInt(casesPerLayer, 10) || 20,
    layers: parseInt(layers, 10) || 7,
    active: true,
  };
  const i = store.db.skus.findIndex((s) => s.code === sku.code);
  if (i >= 0) store.db.skus[i] = { ...store.db.skus[i], ...sku };
  else store.db.skus.push(sku);
  store.save();
  res.json(sku);
});

app.delete("/api/skus/:code", auth.requireAdmin, (req, res) => {
  const sku = findSku(req.params.code);
  if (!sku) return res.status(404).json({ error: "SKU introuvable" });
  sku.active = false; // on garde l'historique
  store.save();
  res.json({ ok: true });
});

// ---------- Analyse photo ----------
app.post("/api/analyze", async (req, res) => {
  const { image, skuCode } = req.body;
  const sku = findSku(skuCode);
  if (!sku) return res.status(400).json({ error: "SKU inconnu" });
  if (!image) return res.status(400).json({ error: "Photo manquante" });
  try {
    const result = await countCases(image, sku, store.db.settings.fullPalletCases);
    res.json(result);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Anthropic.APIError ? `Erreur IA (${err.status})` : err.message;
    res.status(502).json({ error: msg });
  }
});

// ---------- Enregistrement palette (après validation opérateur) ----------
app.post("/api/pallets", (req, res) => {
  const { skuCode, cases, operator, line, lot, image, ai } = req.body;
  const sku = findSku(skuCode);
  const n = parseInt(cases, 10);
  if (!sku) return res.status(400).json({ error: "SKU inconnu" });
  if (!(n >= 0) || n > store.db.settings.fullPalletCases * 1.2)
    return res.status(400).json({ error: "Nombre de caisses invalide" });

  const date = today();
  const id = crypto.randomUUID();
  const number = store.db.pallets.filter((p) => p.date === date).length + 1;
  const pallet = {
    id,
    number,
    date,
    time: new Date().toISOString(),
    skuCode: sku.code,
    cases: n,
    aiCases: ai ? ai.total_cases : null,
    aiConfidence: ai ? ai.confidence : null,
    corrected: ai ? ai.total_cases !== n : false,
    operator: operator || "",
    line: line || "",
    lot: lot || "",
    photo: image ? store.savePhoto(id, image) : null,
  };
  store.db.pallets.push(pallet);
  store.save();
  res.json(pallet);
});

app.delete("/api/pallets/:id", auth.requireAdmin, (req, res) => {
  const i = store.db.pallets.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Palette introuvable" });
  store.db.pallets.splice(i, 1);
  store.save();
  res.json({ ok: true });
});

// ---------- Bilan ----------
function report(date) {
  const full = store.db.settings.fullPalletCases;
  const pallets = store.db.pallets.filter((p) => p.date === date);
  const bySku = {};
  for (const p of pallets) {
    const sku = findSku(p.skuCode);
    const r = (bySku[p.skuCode] ||= {
      skuCode: p.skuCode,
      name: sku ? sku.name : p.skuCode,
      pallets: 0,
      fullPallets: 0,
      partialPallets: 0,
      cases: 0,
      corrections: 0,
    });
    r.pallets++;
    r.cases += p.cases;
    if (p.cases >= full) r.fullPallets++;
    else r.partialPallets++;
    if (p.corrected) r.corrections++;
  }
  const lines = Object.values(bySku).sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  const totals = lines.reduce(
    (t, r) => ({
      pallets: t.pallets + r.pallets,
      fullPallets: t.fullPallets + r.fullPallets,
      partialPallets: t.partialPallets + r.partialPallets,
      cases: t.cases + r.cases,
      corrections: t.corrections + r.corrections,
    }),
    { pallets: 0, fullPallets: 0, partialPallets: 0, cases: 0, corrections: 0 }
  );
  return { date, fullPalletCases: full, lines, totals, pallets: pallets.slice().reverse() };
}

app.get("/api/report", (req, res) => res.json(report(req.query.date || today())));

app.get("/api/report.csv", (req, res) => {
  const r = report(req.query.date || today());
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ["Date", "SKU", "Désignation", "Palettes", "Palettes pleines", "Palettes partielles", "Caisses", "Corrections IA"],
    ...r.lines.map((l) => [r.date, l.skuCode, l.name, l.pallets, l.fullPallets, l.partialPallets, l.cases, l.corrections]),
    [r.date, "TOTAL", "", r.totals.pallets, r.totals.fullPallets, r.totals.partialPallets, r.totals.cases, r.totals.corrections],
    [],
    ["N° palette", "Heure", "SKU", "Caisses", "Caisses IA", "Confiance IA", "Corrigé", "Opérateur", "Ligne", "Lot"],
    ...r.pallets
      .slice()
      .reverse()
      .map((p) => [
        p.number,
        new Date(p.time).toLocaleTimeString("fr-FR"),
        p.skuCode,
        p.cases,
        p.aiCases ?? "",
        p.aiConfidence ?? "",
        p.corrected ? "oui" : "non",
        p.operator,
        p.line,
        p.lot,
      ]),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="bilan-production-${r.date}.csv"`);
  // BOM + ";" pour ouverture directe dans Excel (version française)
  res.send("﻿" + rows.map((row) => row.map(esc).join(";")).join("\r\n"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Comptage palettes : http://localhost:${PORT}  ${DEMO ? "(MODE DÉMO – pas de clé API)" : `(IA : ${MODEL})`}`);
});
