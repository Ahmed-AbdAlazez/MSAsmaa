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

// The publishable/public key CANNOT write to Storage (it gets blocked by row
// level security). Catching this here turns a confusing runtime RLS error
// into an immediate message that names the correct key to copy.
if (/^sb_publishable|^eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJyb2xlIjoiYW5vbiI/i.test(
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
)) {
  throw new Error(
    "[supabaseStorage.service] SUPABASE_SERVICE_ROLE_KEY holds a PUBLIC/publishable key. " +
      "Copy the SECRET key instead: Supabase Dashboard -> Project Settings -> API Keys -> " +
      "'sb_secret_...' (or legacy 'service_role' JWT)."
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
 * Makes sure the private materials bucket exists before any Storage call.
 * The service role key is allowed to create buckets, so a fresh Supabase
 * project works without any manual dashboard step. The check result is
 * cached after the first success to avoid an extra round trip per request.
 */
let materialsBucketVerified = false;

async function ensureMaterialsBucket() {
  if (materialsBucketVerified) return;

  const { error } = await supabaseClient.storage.createBucket(
    MATERIALS_BUCKET_NAME,
    { public: false }
  );

  if (error && !/already exists|409/i.test(error.message || "")) {
    throw new Error(`Supabase bucket setup failed: ${error.message}`);
  }

  materialsBucketVerified = true;
}

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
 * Converts a lesson ID into a safe folder name.
 * Lesson IDs already follow a simple "lesson-N" pattern, but this guard keeps
 * storage paths predictable if a caller sends unexpected characters.
 *
 * @param {string} lessonId - The lesson the uploaded PDF belongs to.
 * @returns {string} A safe storage folder name.
 */
function buildSafeLessonFolderName(lessonId) {
  return (
    String(lessonId || "standalone")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "standalone"
  );
}

/**
 * Builds a unique object path for a PDF before it is uploaded.
 * The timestamp and random suffix prevent two teachers from overwriting each
 * other when they upload files with the same original name.
 *
 * @param {string} fileName - The original uploaded filename.
 * @param {string} lessonId - The lesson folder to store this PDF under.
 * @returns {string} The object path to store inside Supabase Storage.
 */
function buildStorageFilePath(fileName, lessonId) {
  const lessonFolderName = buildSafeLessonFolderName(lessonId);
  const safeFileName = buildSafePdfFileName(fileName);
  const randomSuffix = Math.random().toString(36).slice(2, 10);

  return `lessons/${lessonFolderName}/${Date.now()}-${randomSuffix}-${safeFileName}`;
}

/**
 * Uploads a PDF buffer to the private lesson-materials bucket.
 * The caller receives only the storage path because downloads must go through
 * a later signed URL after the enrollment access check passes.
 *
 * @param {Buffer} fileBuffer - The uploaded PDF bytes from multer memory storage.
 * @param {string} fileName - The teacher's original filename.
 * @param {string} lessonId - The lesson this PDF belongs to.
 * @returns {Promise<string>} The private Supabase Storage object path.
 */
async function uploadPdf(fileBuffer, fileName, lessonId) {
  await ensureMaterialsBucket();
  const filePath = buildStorageFilePath(fileName, lessonId);

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
 * Lists PDF objects stored for one lesson.
 * This gives the temporary material service a durable production-friendly
 * source of truth without adding a Prisma table yet.
 *
 * @param {string} lessonId - The lesson whose PDF folder should be listed.
 * @returns {Promise<object[]>} Supabase Storage file objects.
 */
async function listLessonPdfFiles(lessonId) {
  await ensureMaterialsBucket();
  const lessonFolderName = buildSafeLessonFolderName(lessonId);
  const folderPath = `lessons/${lessonFolderName}`;

  const { data, error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .list(folderPath, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    throw new Error(`Supabase PDF list failed: ${error.message}`);
  }

  return (data || [])
    .filter((fileObject) => /\.pdf$/i.test(fileObject.name || ""))
    .map((fileObject) => ({
      ...fileObject,
      filePath: `${folderPath}/${fileObject.name}`,
    }));
}

/**
 * Creates a short-lived signed URL for a stored PDF.
 * By default the URL forces a browser DOWNLOAD (Content-Disposition:
 * attachment). Passing forceDownload=false produces an INLINE URL instead,
 * which lets browsers render the PDF inside an <iframe> on the lesson page.
 * This is intentionally separate from uploadPdf so routes can perform access
 * control first and only then ask Supabase for a usable link.
 *
 * @param {string} filePath - The private object path saved in the material record.
 * @param {number} expiresInSeconds - How long the signed URL should work.
 * @param {object} [options] - Behaviour switches.
 * @param {boolean} [options.forceDownload=true] - True = attachment, false = inline view.
 * @returns {Promise<string>} A temporary signed URL.
 */
async function generateSignedDownloadUrl(filePath, expiresInSeconds, options = {}) {
  await ensureMaterialsBucket();
  const forceDownload = options.forceDownload !== false;

  const { data, error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .createSignedUrl(filePath, expiresInSeconds, {
      download: forceDownload,
    });

  if (error) {
    throw new Error(`Supabase signed download URL failed: ${error.message}`);
  }

  return data.signedUrl;
}

module.exports = {
  uploadPdf,
  listLessonPdfFiles,
  generateSignedDownloadUrl,
};
