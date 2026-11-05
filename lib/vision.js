// Comptage des caisses sur une photo de palette avec Claude (vision).
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const DEMO = process.env.DEMO_MODE === "1" || !process.env.ANTHROPIC_API_KEY;

const client = DEMO ? null : new Anthropic();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "layers_counted",
    "cases_per_full_layer",
    "top_layer_cases",
    "total_cases",
    "confidence",
    "photo_quality_ok",
    "observations",
  ],
  properties: {
    layers_counted: { type: "integer", description: "Nombre de couches visibles, couche du dessus incluse" },
    cases_per_full_layer: { type: "integer", description: "Caisses dans une couche complète" },
    top_layer_cases: { type: "integer", description: "Caisses présentes sur la couche du dessus" },
    total_cases: { type: "integer", description: "Total estimé de caisses sur la palette" },
    confidence: { type: "string", enum: ["haute", "moyenne", "faible"] },
    photo_quality_ok: { type: "boolean", description: "Faux si la photo ne permet pas un comptage fiable" },
    observations: { type: "string", description: "Remarques courtes en français (trou, caisse abîmée, angle, etc.)" },
  },
};

function buildPrompt(sku, fullPalletCases) {
  return `Tu es contrôleur de production dans un atelier de conditionnement de brumes parfumées.
La photo montre UNE palette de caisses en carton, prise en fin de palettisation.

Plan de palettisation théorique pour ce SKU (${sku.code} – ${sku.name}) :
- ${sku.casesPerLayer} caisses par couche
- ${sku.layers} couches pour une palette complète
- palette pleine = ${fullPalletCases} caisses

Méthode de comptage à appliquer :
1. Compte le nombre de couches sur les faces visibles.
2. Vérifie qu'une couche complète correspond au plan (${sku.casesPerLayer} caisses) ; sinon, donne ce que tu vois.
3. Compte précisément les caisses de la couche du dessus (souvent incomplète en fin de lot).
4. Total = (couches complètes sous le dessus × caisses par couche) + caisses de la couche du dessus.
5. Signale tout trou visible dans les couches inférieures et retire-le du total.

Si la photo est floue, trop serrée ou ne montre pas le dessus de la palette, mets photo_quality_ok à false et confidence à "faible".
Réponds uniquement avec le JSON demandé.`;
}

function demoResult(sku, fullPalletCases) {
  const full = Math.random() < 0.7;
  const top = full ? sku.casesPerLayer : Math.floor(Math.random() * sku.casesPerLayer) + 1;
  const layers = full ? sku.layers : Math.floor(Math.random() * sku.layers) + 1;
  return {
    layers_counted: layers,
    cases_per_full_layer: sku.casesPerLayer,
    top_layer_cases: top,
    total_cases: Math.min(fullPalletCases, (layers - 1) * sku.casesPerLayer + top),
    confidence: "moyenne",
    photo_quality_ok: true,
    observations: "MODE DÉMO : résultat simulé (aucune clé API configurée).",
    demo: true,
  };
}

async function countCases(base64Jpeg, sku, fullPalletCases) {
  if (DEMO) return demoResult(sku, fullPalletCases);

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    // Si le modèle refuse la requête, l'API relance automatiquement sur un modèle de secours.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
          { type: "text", text: buildPrompt(sku, fullPalletCases) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Analyse refusée par l'IA – saisir le comptage manuellement.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Réponse IA incomplète – réessayer.");
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

module.exports = { countCases, DEMO, MODEL };
