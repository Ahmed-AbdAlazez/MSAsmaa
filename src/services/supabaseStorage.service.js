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
const QUIZ_IMAGES_BUCKET_NAME = "quiz-images";

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

  // Explicit CORS policy for the bucket. Signed-URL <iframe>/<img> loads are
  // not CORS-gated, but any client-side fetch/XHR of storage URLs is — this
  // keeps those working and documents exactly which origins may read.
  // Override via env: MATERIALS_CORS_ORIGINS="https://app.tld,https://other.tld"
  const allowedOrigins = (
    process.env.MATERIALS_CORS_ORIGINS ||
    "*"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const { error: corsError } = await supabaseClient.storage.updateBucket(
    MATERIALS_BUCKET_NAME,
    { public: false, allowedOrigins }
  );

  if (corsError) {
    console.error(
      `[supabaseStorage.service] Bucket CORS update failed (non-fatal): ${corsError.message}`
    );
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
      // Management-relevant fields the student view does not need but the
      // teacher "manage materials" screen displays (size + upload date).
      sizeBytes: fileObject.metadata?.size ?? null,
      createdAt: fileObject.created_at || fileObject.updated_at || null,
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

/**
 * Renames (moves) a stored object inside the same private bucket.
 * Used by the teacher "rename material" flow: because the stub keeps no
 * separate database table yet, the custom title lives in the object name,
 * so renaming = moving the object to a new marker-encoded name.
 *
 * @param {string} fromPath - The current private object path.
 * @param {string} toPath - The new private object path.
 * @returns {Promise<true>} Resolves when Supabase confirms the move.
 */
async function moveFile(fromPath, toPath) {
  await ensureMaterialsBucket();
  const { error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .move(fromPath, toPath);

  if (error) {
    throw new Error(`Supabase file move failed: ${error.message}`);
  }

  return true;
}

/**
 * Permanently deletes one stored object from the private materials bucket.
 * The DELETE route calls this BEFORE removing any record reference so a
 * failed storage delete can never leave a database row pointing at an
 * existing file.
 *
 * @param {string} filePath - The private object path to remove.
 * @returns {Promise<true>} Resolves when Supabase accepts the deletion.
 */
async function deleteFile(filePath) {
  await ensureMaterialsBucket();
  const { error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .remove([filePath]);

  if (error) {
    throw new Error(`Supabase file delete failed: ${error.message}`);
  }

  return true;
}

/**
 * Creates a short-lived signed UPLOAD URL so the browser can PUT the PDF
 * bytes straight into Supabase Storage. Vercel caps function request bodies
 * at ~4.5MB (413 errors on large uploads) — with this flow the file never
 * passes through a serverless function at all, so any size works.
 *
 * @param {string} fileName - The teacher's original filename.
 * @param {string} lessonId - The lesson folder to store this PDF under.
 * @returns {Promise<object>} { signedUrl, token, filePath }
 */
async function createSignedUploadForLesson(fileName, lessonId) {
  await ensureMaterialsBucket();
  const filePath = buildStorageFilePath(fileName, lessonId);

  const { data, error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .createSignedUploadUrl(filePath);

  if (error || !data) {
    throw new Error(
      `Supabase signed upload URL failed: ${error ? error.message : "empty response"}`
    );
  }

  return { signedUrl: data.signedUrl, token: data.token, filePath };
}

/**
 * Overwrites an existing object's bytes in place (used after server-side
 * normalization of a directly-uploaded PDF).
 */
async function overwritePdf(filePath, fileBuffer) {
  await ensureMaterialsBucket();
  const { error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .upload(filePath, fileBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase PDF overwrite failed: ${error.message}`);
  }

  return true;
}

/**
 * Downloads a stored object as raw bytes using the SDK (server-side only).
 * Used by the finalize step to normalize directly-uploaded PDFs; the bytes
 * travel Supabase->function->Supabase, never through a Vercel HTTP body.
 */
async function downloadPdfBytes(filePath) {
  await ensureMaterialsBucket();
  const { data, error } = await supabaseClient.storage
    .from(MATERIALS_BUCKET_NAME)
    .download(filePath);

  if (error || !data) {
    throw new Error(
      `Supabase file download failed: ${error ? error.message : "empty response"}`
    );
  }

  return Buffer.from(await data.arrayBuffer());
}

/* ==========================================================================
 * QUIZ QUESTION IMAGES
 * -------------------------------------------------------------------------
 * Same service-role-key pattern as the PDF functions above, but for the
 * "quiz-images" bucket. Images are stored PRIVATE like PDFs: questions keep
 * only the object path, and every display (<img> tag) gets a short-lived
 * signed URL generated on demand after an auth check.
 *
 * JPG / PNG / WEBP (anything a browser can decode) work as-is — the file
 * bytes are stored untouched and rendered by a plain <img>, so no format
 * conversion is needed anywhere.
 * ========================================================================== */

/** Image MIME types we accept for question images. */
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Maps an allowed MIME type to its canonical file extension. */
const IMAGE_EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

let quizImagesBucketVerified = false;

/**
 * Makes sure the private quiz-images bucket exists (same auto-create pattern
 * as ensureMaterialsBucket, cached after first success).
 */
async function ensureQuizImagesBucket() {
  if (quizImagesBucketVerified) return;

  const { error } = await supabaseClient.storage.createBucket(
    QUIZ_IMAGES_BUCKET_NAME,
    { public: false }
  );

  // The bucket already exists in this project — that is fine.
  if (error && !/already exists|409/i.test(error.message || "")) {
    throw new Error(`Supabase quiz-image bucket setup failed: ${error.message}`);
  }

  quizImagesBucketVerified = true;
}

/**
 * Validates that an uploaded question image has a type browsers can render.
 *
 * @param {object} uploadedFile - A multer file object.
 * @returns {boolean} True when the MIME type is jpg/png/webp.
 */
function isAllowedQuizImage(uploadedFile) {
  return Boolean(
    uploadedFile &&
      ALLOWED_IMAGE_MIME_TYPES.has(uploadedFile.mimetype)
  );
}

/**
 * Uploads one quiz-question image into the private quiz-images bucket.
 *
 * The extension comes from the VERIFIED MIME type (not from the original
 * filename) so a mislabeled upload can never produce a broken path.
 *
 * @param {Buffer} fileBuffer - The raw image bytes.
 * @param {string} mimeType   - Verified image MIME type.
 * @param {string} quizId     - Folder segment, keeps images grouped per quiz.
 * @returns {Promise<string>} The private object path to store on the question.
 */
async function uploadQuizImage(fileBuffer, mimeType, quizId) {
  await ensureQuizImagesBucket();

  const safeFolder = buildSafeLessonFolderName(quizId);
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[mimeType] || "img";
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const filePath = `quizzes/${safeFolder}/${Date.now()}-${randomSuffix}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(QUIZ_IMAGES_BUCKET_NAME)
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase quiz-image upload failed: ${error.message}`);
  }

  return filePath;
}

/**
 * Creates a short-lived signed URL for displaying a stored question image
 * in an <img src>. Call ONLY after the requester passed auth checks.
 *
 * @param {string} filePath       - The private path saved on the question.
 * @param {number} expiresInSeconds - Signed URL lifetime.
 * @returns {Promise<string>} A temporary display URL.
 */
async function getQuizImageSignedUrl(filePath, expiresInSeconds = 60 * 60) {
  await ensureQuizImagesBucket();

  const { data, error } = await supabaseClient.storage
    .from(QUIZ_IMAGES_BUCKET_NAME)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(
      `Supabase quiz-image signed URL failed: ${error ? error.message : "empty response"}`
    );
  }

  return data.signedUrl;
}

module.exports = {
  uploadPdf,
  listLessonPdfFiles,
  generateSignedDownloadUrl,
  moveFile,
  deleteFile,
  createSignedUploadForLesson,
  overwritePdf,
  downloadPdfBytes,
  uploadQuizImage,
  getQuizImageSignedUrl,
  isAllowedQuizImage,
};
