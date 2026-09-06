/**
 * api/index.js
 * ----------------------------------------------------------------------------
 * Vercel serverless entry point.
 *
 * Vercel cannot run a long-lived "node server.js" process. Instead, every
 * request to /api/* is rewritten (see vercel.json) into this serverless
 * function, which simply hands the request to the same Express app used
 * locally. No code duplication: app.js holds all routes.
 *
 * WHY THE WRAPPER: app.js -> bunny.env.config.js validates the Bunny
 * environment variables AT REQUIRE TIME and throws if they are missing.
 * An uncaught throw during module load makes Vercel return its own HTML/text
 * error page instead of JSON, which the frontend then reports as
 * "رد غير متوقع من السيرفر (ليس JSON)". Wrapping require + dispatch in
 * try/catch turns that into a clear JSON 500 naming the actual cause.
 */

let cachedApp = null;

module.exports = async function handler(req, res) {
  try {
    // Lazy-load on first invocation so startup failures are catchable here.
    if (!cachedApp) cachedApp = require("../app.js");
    return await cachedApp(req, res);
  } catch (err) {
    console.error("[api/index] request failed:", err && err.message);
    if (!res.headersSent) {
      res.status(500).json({
        // Include the underlying error message so the toast on screen names
        // the REAL cause (missing env vars vs old Node without fetch, etc.)
        // instead of a generic "check your variables" hint.
        error: `وظيفة السيرفر فشلت على الاستضافة: ${err && err.message}`,
      });
    }
  }
};
