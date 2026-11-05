const $ = (id) => document.getElementById(id);
let config = null;
let photoB64 = null;
let aiResult = null;

// ---------- Utilitaires ----------
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const remember = (id) => {
  try { $(id).value = localStorage.getItem(id) || ""; } catch {}
  $(id).addEventListener("change", () => { try { localStorage.setItem(id, $(id).value); } catch {} });
};
const today = () => new Date().toLocaleDateString("sv-SE");

// Réduit la photo (≈1568 px, JPEG) avant envoi : plus rapide sur le réseau atelier, suffisant pour l'IA.
function resizeImage(file, max = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Onglets ----------
document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button, .tab").forEach((el) => el.classList.remove("active"));
    b.classList.add("active");
    $(b.dataset.tab).classList.add("active");
    if (b.dataset.tab === "bilan") loadReport();
  })
);

// ---------- Config ----------
async function loadConfig() {
  config = await api("/api/config");
  const active = config.skus.filter((s) => s.active);
  const current = $("sku").value || (() => { try { return localStorage.getItem("sku"); } catch { return null; } })();
  $("sku").innerHTML = active.map((s) => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} – ${escapeHtml(s.name)}</option>`).join("");
  if (current && active.some((s) => s.code === current)) $("sku").value = current;
  $("fullCases").value = config.settings.fullPalletCases;
  $("mode").textContent = config.demo ? "MODE DÉMO" : "IA active";
  $("mode").classList.toggle("demo", config.demo);
  $("skuList").innerHTML = active
    .map((s) => `<li><div class="grow"><b>${escapeHtml(s.code)}</b><br><small>${escapeHtml(s.name)} · ${s.casesPerLayer} × ${s.layers} couches</small></div>
      <button data-edit="${escapeHtml(s.code)}" style="color:inherit">Modifier</button><button data-del="${escapeHtml(s.code)}">Retirer</button></li>`)
    .join("");
}
const currentSku = () => config.skus.find((s) => s.code === $("sku").value);
$("sku").addEventListener("change", () => { try { localStorage.setItem("sku", $("sku").value); } catch {} });

// ---------- Photo & analyse ----------
$("photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!currentSku()) return toast("Choisir un SKU d'abord");
  const dataUrl = await resizeImage(file);
  photoB64 = dataUrl.split(",")[1];
  $("preview").src = dataUrl;
  $("preview").hidden = false;
  $("status").textContent = "⏳ Analyse de la palette en cours…";
  $("result").hidden = true;
  try {
    aiResult = await api("/api/analyze", { method: "POST", body: JSON.stringify({ image: photoB64, skuCode: currentSku().code }) });
    $("status").textContent = "";
    showResult(aiResult);
  } catch (err) {
    aiResult = null;
    $("status").textContent = "⚠️ " + err.message + " – saisir le nombre manuellement.";
    showResult(null);
  }
  e.target.value = "";
});

function showResult(ai) {
  const full = config.settings.fullPalletCases;
  if (ai) {
    const pct = Math.round((ai.total_cases / full) * 100);
    $("aiDetail").innerHTML = `
      <div><span class="big">${ai.total_cases}</span> caisses détectées (${pct} %)</div>
      <div>${ai.layers_counted} couches · ${ai.cases_per_full_layer} caisses/couche · dessus : ${ai.top_layer_cases}</div>
      <div>Confiance : <b class="conf-${ai.confidence}">${ai.confidence}</b>${ai.photo_quality_ok ? "" : " · <b class='conf-faible'>photo à refaire</b>"}</div>
      ${ai.observations ? `<div><small>${escapeHtml(ai.observations)}</small></div>` : ""}`;
    $("cases").value = ai.total_cases;
  } else {
    $("aiDetail").innerHTML = "<div>Comptage manuel</div>";
    $("cases").value = "";
  }
  $("calcBox").hidden = true;
  $("result").hidden = false;
  $("result").scrollIntoView({ behavior: "smooth" });
}

$("manual").addEventListener("click", () => {
  if (!currentSku()) return toast("Choisir un SKU d'abord");
  photoB64 = null; aiResult = null;
  $("preview").hidden = true; $("status").textContent = "";
  showResult(null);
});

document.querySelectorAll("[data-step]").forEach((b) =>
  b.addEventListener("click", () => { $("cases").value = Math.max(0, (parseInt($("cases").value, 10) || 0) + +b.dataset.step); })
);
$("setFull").addEventListener("click", () => { $("cases").value = config.settings.fullPalletCases; });
$("calc").addEventListener("click", () => { $("calcBox").hidden = !$("calcBox").hidden; });
["calcLayers", "calcTop"].forEach((id) =>
  $(id).addEventListener("input", () => {
    $("cases").value = (parseInt($("calcLayers").value, 10) || 0) * currentSku().casesPerLayer + (parseInt($("calcTop").value, 10) || 0);
  })
);

$("save").addEventListener("click", async () => {
  const cases = parseInt($("cases").value, 10);
  if (!(cases >= 0)) return toast("Indiquer le nombre de caisses");
  const full = config.settings.fullPalletCases;
  if (cases > full && !confirm(`${cases} caisses dépasse une palette pleine (${full}). Confirmer ?`)) return;
  $("save").disabled = true;
  try {
    const p = await api("/api/pallets", {
      method: "POST",
      body: JSON.stringify({
        skuCode: currentSku().code, cases,
        operator: $("operator").value, line: $("line").value, lot: $("lot").value,
        image: photoB64, ai: aiResult,
      }),
    });
    toast(`Palette n°${p.number} enregistrée : ${p.cases} caisses`);
    photoB64 = null; aiResult = null;
    $("result").hidden = true; $("preview").hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    toast(err.message);
  } finally {
    $("save").disabled = false;
  }
});

// ---------- Bilan ----------
async function loadReport() {
  const date = $("date").value || today();
  $("date").value = date;
  $("csv").href = `/api/report.csv?date=${date}`;
  const r = await api(`/api/report?date=${date}`);
  const t = r.totals;
  $("kpis").innerHTML = `
    <div><b>${t.cases}</b><span>caisses</span></div>
    <div><b>${t.pallets}</b><span>palettes (${t.fullPallets} pleines)</span></div>
    <div><b>${t.corrections}</b><span>corrections IA</span></div>`;
  $("reportBody").innerHTML = r.lines.length
    ? r.lines.map((l) => `<tr><td><b>${escapeHtml(l.skuCode)}</b><br><small>${escapeHtml(l.name)}</small></td><td>${l.pallets}</td><td>${l.fullPallets}</td><td><b>${l.cases}</b></td></tr>`).join("")
    : `<tr><td colspan="4">Aucune palette ce jour.</td></tr>`;
  $("reportFoot").innerHTML = `<tr><td>TOTAL</td><td>${t.pallets}</td><td>${t.fullPallets}</td><td>${t.cases}</td></tr>`;
  $("palletList").innerHTML = r.pallets
    .map((p) => `<li>
      ${p.photo ? `<a href="/photos/${p.photo}" target="_blank"><img src="/photos/${p.photo}" alt=""></a>` : ""}
      <div class="grow"><b>N°${p.number}</b> · ${escapeHtml(p.skuCode)} · <b>${p.cases}</b> caisses
        ${p.corrected ? `<span class="tag">corrigé (IA : ${p.aiCases})</span>` : ""}<br>
        <small>${new Date(p.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${escapeHtml(p.operator || "—")} ${p.line ? "· " + escapeHtml(p.line) : ""} ${p.lot ? "· lot " + escapeHtml(p.lot) : ""}</small></div>
      <button data-delpal="${p.id}">Suppr.</button></li>`)
    .join("");
}
$("date").addEventListener("change", loadReport);
$("palletList").addEventListener("click", async (e) => {
  const id = e.target.dataset.delpal;
  if (!id || !confirm("Supprimer cette palette du bilan ?")) return;
  await api(`/api/pallets/${id}`, { method: "DELETE" });
  loadReport();
});

// ---------- Réglages ----------
$("saveSettings").addEventListener("click", async () => {
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ fullPalletCases: $("fullCases").value }) });
    await loadConfig();
    toast("Réglage enregistré");
  } catch (err) { toast(err.message); }
});
$("saveSku").addEventListener("click", async () => {
  const perLayer = parseInt($("skuPerLayer").value, 10), layers = parseInt($("skuLayers").value, 10);
  if (perLayer * layers !== config.settings.fullPalletCases &&
      !confirm(`${perLayer} × ${layers} = ${perLayer * layers} caisses, différent de la palette pleine (${config.settings.fullPalletCases}). Continuer ?`)) return;
  try {
    await api("/api/skus", { method: "POST", body: JSON.stringify({ code: $("skuCode").value, name: $("skuName").value, casesPerLayer: perLayer, layers }) });
    $("skuCode").value = ""; $("skuName").value = "";
    await loadConfig();
    toast("SKU enregistré");
  } catch (err) { toast(err.message); }
});
$("skuList").addEventListener("click", async (e) => {
  const edit = e.target.dataset.edit, del = e.target.dataset.del;
  if (edit) {
    const s = config.skus.find((x) => x.code === edit);
    $("skuCode").value = s.code; $("skuName").value = s.name; $("skuPerLayer").value = s.casesPerLayer; $("skuLayers").value = s.layers;
    $("skuCode").scrollIntoView({ behavior: "smooth" });
  }
  if (del && confirm(`Retirer ${del} de la liste ? (l'historique est conservé)`)) {
    await api(`/api/skus/${encodeURIComponent(del)}`, { method: "DELETE" });
    loadConfig();
  }
});

// ---------- Démarrage ----------
remember("operator");
remember("line");
loadConfig().catch((e) => toast(e.message));
