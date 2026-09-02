/**
 * daily.env.config.js
 * ---------------------------------------------------------------------------
 * Loads and exposes the Daily.co live-streaming settings.
 *
 * Unlike bunny.env.config.js (which crashes at startup when a key is missing),
 * this file deliberately does NOT crash. Live streaming is an OPTIONAL feature:
 * if DAILY_API_KEY is not configured yet, the whole live feature runs in a
 * documented STUB/DEV mode — the UI and endpoints still work end-to-end, but
 * instead of creating real Daily rooms it returns simulated room URLs and
 * clearly marks them as stubs. This lets the feature be built and tested
 * before the key is added (see the "SETUP NEEDED FROM ME" section at the top
 * of LIVE_README / the summary).
 *
 * SECURITY RULES (same as Bunny):
 *   - Values are read ONLY from process.env. No key is ever written in code.
 *   - The API key stays server-side; the client never receives it.
 * ---------------------------------------------------------------------------
 */

let dotenv;
try {
  dotenv = require("dotenv");
} catch (error) {
  throw new Error(
    'The "dotenv" package is not installed. Run "npm install dotenv" ' +
      "then start the server again."
  );
}
dotenv.config();

const configured = (name) => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "";
};

// Three settings. Only the API key is strictly required to go "live".
// DAILY_DOMAIN defaults to the subdomain encoded inside the key's first dot
// segment when not provided (common Daily convention), and DAILY_ROOM_PREFIX
// just namespaces room names so they cannot collide with other apps.
const apiKey = configured("DAILY_API_KEY")
  ? process.env.DAILY_API_KEY.trim()
  : "";

// Stub/dev mode toggle: a real key means real Daily API calls.
const isConfigured = Boolean(apiKey);

// Derive the domain from the key when not provided. A Daily API key looks like
// "5522b3383d2e7cfc36f0d9e58aa3f3e0d312b...". Daily domains are
// "<subdomain>.daily.co". The subdomain is the first 7 hex chars of the key.
function deriveDomainFromKey(key) {
  if (!key) return "";
  const match = String(key).match(/^([0-9a-f]{7})/i);
  return match ? `${match[1].toLowerCase()}.daily.co` : "";
}

const domain = configured("DAILY_DOMAIN")
  ? process.env.DAILY_DOMAIN.trim().replace(/\.daily\.co$/i, "") + ".daily.co"
  : deriveDomainFromKey(apiKey);

const roomPrefix = configured("DAILY_ROOM_PREFIX")
  ? process.env.DAILY_ROOM_PREFIX.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
  : "msasmaa";

const dailyEnv = Object.freeze({
  // Empty string means "not configured yet" -> live feature runs in stub mode.
  apiKey,
  domain,
  roomPrefix,
  // True only when a real key is present.
  isConfigured,
  // Stable name of the single live-session room used by this platform.
  // Deterministic so a restart re-points everyone at the same room name.
  roomName: roomPrefix
    ? `${roomPrefix}-live`
    : "msasmaa-live",
});

module.exports = dailyEnv;
