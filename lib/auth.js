// Accès par code : un code "atelier" (opérateurs) et un code "responsable" (réglages, suppressions).
// La session est un cookie signé (HMAC), valable 30 jours.
const crypto = require("crypto");

const ACCESS_CODE = process.env.ACCESS_CODE || "";
const ADMIN_CODE = process.env.ADMIN_CODE || "";
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE = "cp_session";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const IS_PROD = process.env.NODE_ENV === "production";

// Sans code configuré (usage local), l'accès est ouvert avec les droits responsable.
const OPEN = !ACCESS_CODE && !ADMIN_CODE;

if (IS_PROD && (!ACCESS_CODE || !ADMIN_CODE)) {
  console.error("ACCESS_CODE et ADMIN_CODE sont obligatoires en production.");
  process.exit(1);
}

const sign = (payload) => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

function sameCode(input, expected) {
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(String(input)).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function readSession(req) {
  if (OPEN) return { role: "admin" };
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [role, exp, sig] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split(".");
  if (!role || !exp || !sig) return null;
  const expected = sign(`${role}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Date.now() > Number(exp)) return null;
  return { role };
}

function setSession(res, role) {
  const exp = Date.now() + MAX_AGE_MS;
  const value = `${role}.${exp}.${sign(`${role}.${exp}`)}`;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_MS / 1000}${IS_PROD ? "; Secure" : ""}`
  );
}

function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PROD ? "; Secure" : ""}`);
}

// Limite les essais de code : 10 échecs par adresse IP sur 15 minutes.
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.reset) return false;
  return a.count >= 10;
}
function recordFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.reset) attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
  else a.count++;
}

function loginHandler(req, res) {
  if (OPEN) return res.json({ role: "admin" });
  if (tooManyAttempts(req.ip)) return res.status(429).json({ error: "Trop d'essais. Réessayer dans 15 minutes." });
  const code = String((req.body && req.body.code) || "");
  let role = null;
  if (sameCode(code, ADMIN_CODE)) role = "admin";
  else if (sameCode(code, ACCESS_CODE)) role = "operator";
  if (!role) {
    recordFailure(req.ip);
    return res.status(401).json({ error: "Code incorrect" });
  }
  attempts.delete(req.ip);
  setSession(res, role);
  res.json({ role });
}

function logoutHandler(req, res) {
  clearSession(res);
  res.json({ ok: true });
}

const requireLogin = (req, res, next) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Connexion requise" });
  req.role = s.role;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.role !== "admin") return res.status(403).json({ error: "Réservé au responsable" });
  next();
};

module.exports = { loginHandler, logoutHandler, requireLogin, requireAdmin, OPEN };
