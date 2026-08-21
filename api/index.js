/**
 * api/index.js
 * ---------------------------------------------------------------------------
 * Vercel serverless entry point.
 *
 * Vercel cannot run a long-lived "node server.js" process. Instead, every
 * request to /api/* is rewritten (see vercel.json) into this serverless
 * function, which simply hands the request to the same Express app used
 * locally. No code duplication: app.js holds all routes.
 */

const app = require("../app.js");

module.exports = app;
