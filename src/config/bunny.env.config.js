/**
 * bunny.env.config.js
 * ---------------------------------------------------------------------------
 * Loads environment variables with dotenv and VALIDATES the three Bunny.net
 * settings the moment this file is first required.
 *
 * Why validate here instead of inside each Bunny function?
 * Because this file sits at the top of the require chain
 * (server.js -> video.routes.js -> bunny.service.js -> THIS FILE), the check
 * runs once at SERVER STARTUP. A misconfigured deployment therefore crashes
 * immediately with a readable message, instead of limping along until the
 * first student tries to watch a video and hitting a confusing failure.
 *
 * SECURITY RULES:
 *   - Values are read ONLY from process.env (which dotenv fills from a .env
 *     file). No key is ever written in code.
 *   - If any variable is missing or blank, startup fails with an error that
 *     lists EVERY missing variable at once, so you never play whack-a-mole.
 *
 * Note: dotenv.config() does NOT overwrite variables that are already set in
 * the real environment (e.g. by your host), so it is safe even if server.js
 * also calls dotenv.config() itself.
 */

// Fail with a friendly message if the dotenv package itself is missing,
// instead of Node's cryptic "Cannot find module 'dotenv'" stack trace.
let dotenv;
try {
  dotenv = require("dotenv");
} catch (error) {
  throw new Error(
    'The "dotenv" package is not installed. Run "npm install dotenv" ' +
      "in your backend project, then start the server again."
  );
}

/** Reads a .env file (if present) into process.env. Safe to call repeatedly. */
dotenv.config();

/**
 * The three Bunny.net settings this integration cannot work without.
 * "description" exists purely so the startup error can teach the developer
 * where to find each value.
 */
const REQUIRED_BUNNY_VARIABLES = [
  {
    name: "BUNNY_API_KEY",
    description:
      "secret key used to create/upload videos (Bunny dashboard -> Account Settings -> API Keys)",
  },
  {
    name: "BUNNY_LIBRARY_ID",
    description:
      "numeric ID of your Stream video library (Bunny dashboard -> Stream -> your library)",
  },
  {
    name: "BUNNY_SIGNING_KEY",
    description:
      "key used to sign playback URLs (Bunny dashboard -> Stream -> your library -> Security -> Token Authentication)",
  },
];

// Collect ALL problems first, so one restart reveals everything that is off.
const missingVariables = REQUIRED_BUNNY_VARIABLES.filter((variable) => {
  const value = process.env[variable.name];
  return typeof value !== "string" || value.trim() === "";
});

if (missingVariables.length > 0) {
  const missingList = missingVariables
    .map((variable) => `  - ${variable.name}: ${variable.description}`)
    .join("\n");

  throw new Error(
    "Server startup failed: missing required Bunny.net environment variable(s).\n" +
      `${missingList}\n\n` +
      "How to fix:\n" +
      "  1. Create (or open) a .env file in the folder you run the server from.\n" +
      "  2. Add one line per variable, e.g.  BUNNY_API_KEY=your-key-here\n" +
      "  3. Restart the server. Values are read only from the environment —\n" +
      "     never paste keys into source code."
  );
}

/**
 * The validated configuration, trimmed and frozen.
 *
 * Frozen (read-only) on purpose: nothing else in the app should be able to
 * accidentally mutate these values while the server is running.
 */
const bunnyEnv = Object.freeze({
  apiKey: process.env.BUNNY_API_KEY.trim(),
  libraryId: process.env.BUNNY_LIBRARY_ID.trim(),
  signingKey: process.env.BUNNY_SIGNING_KEY.trim(),
});

module.exports = bunnyEnv;
