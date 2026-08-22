/**
 * supabaseStorage.service.js
 * ---------------------------------------------------------------------------
 * This service is the only place in the materials feature that talks directly
 * to Supabase Storage. Keeping those calls here makes the route easier to read
 * and keeps the service role key away from browser-facing code.
 */

require("dotenv").config();

const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const MATERIALS_BUCKET_NAME = "lesson-materials";

const requiredEnvironmentVariables = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (variableName) => !process.env[variableName] || !process.env[variableName].trim()
);

if (missingEnvironmentVariables.length > 0) {
  throw new Error(
    `[supabaseStorage.service] Missing required environment variable(s): ${missingEnvironmentVariables.join(
      ", "
    )}. Add them to .env or your hosting environment before starting the server.`
  );
}

const supabaseClient = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Converts a teacher-provided file name into a storage-safe name.
 * Supabase paths should not depend on spaces or special local filename
 * characters, so this keeps the readable base name but strips risky parts.
 *
 * @param {string} fileName - The original uploaded filename.
 * @returns {string} A safe PDF filename.
 */
function buildSafePdfFileName(fileName) {
  const parsedFileName = path.parse(fileName || "lesson-material.pdf");
  const safeBaseName =
    parsedFileName.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lesson-material";

  return `${safeBaseName}.pdf`;
}

/**
 * Builds a unique object path for a PDF before it is uploaded.
 * The timestamp and random suffix prevent two teachers from overwriting each
 * other when they upload files with the same original name.
 *
 * @param {string} fileName - The original uploaded filename.
 * @returns {string} The object path to store inside Supabase Storage.
 */
function buildStorageFilePath(fileName) {
  const safeFileName = buildSafePdfFileName(fileName);
  const randomSuffix = Math.random().toString(36).slice(2, 10);

  return `materials/${Date.now()}-${randomSuffix}-${safeFileName}`;
}

/**
 * Uploads a PDF buffer to the private lesson-materials bucket.
 * The caller receives only the storage path because downloads must go through
 * a later signed URL after the enrollment access check passes.
 *
 * @param {Buffer} fileBuffer - The uploaded PDF bytes from multer memory storage.
 * @param {string} fileName - The teacher's original filename.
 * @returns {Promise<string>} The private Supabase Storage object path.
 */
async function uploadPdf(fileBuffer, fileName) {
  const filePath = buildStorageFilePath(fileName);

  const { error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .upload(filePath, fileBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase PDF upload failed: ${error.message}`);
  }

  return filePath;
}

/**
 * Creates a short-lived private download URL for a stored PDF.
 * This is intentionally separate from uploadPdf so routes can perform access
 * control first and only then ask Supabase for a usable link.
 *
 * @param {string} filePath - The private object path saved in the material record.
 * @param {number} expiresInSeconds - How long the signed URL should work.
 * @returns {Promise<string>} A temporary signed download URL.
 */
async function generateSignedDownloadUrl(filePath, expiresInSeconds) {
  const { data, error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .createSignedUrl(filePath, expiresInSeconds, {
      download: true,
    });

  if (error) {
    throw new Error(`Supabase signed download URL failed: ${error.message}`);
  }

  return data.signedUrl;
}

module.exports = {
  uploadPdf,
  generateSignedDownloadUrl,
};
