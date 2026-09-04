require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const requiredEnvironmentVariables = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (name) => !String(process.env[name] || "").trim(),
);
if (missingEnvironmentVariables.length) {
  throw new Error("Supabase quiz-image configuration is incomplete.");
}

const supabaseClient = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const QUIZ_IMAGES_BUCKET_NAME = "quiz-images";
let quizImagesBucketVerified = false;

async function ensureQuizImagesBucket() {
  if (quizImagesBucketVerified) return;
  const { error } = await supabaseClient.storage.createBucket(
    QUIZ_IMAGES_BUCKET_NAME,
    { public: false },
  );
  if (error && !/already exists|409/i.test(error.message || "")) {
    throw new Error(
      `Supabase quiz-image bucket setup failed: ${error.message}`,
    );
  }
  quizImagesBucketVerified = true;
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const IMAGE_EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isAllowedQuizImage(file) {
  return Boolean(file && ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype));
}

async function uploadQuizImage(fileBuffer, mimeType, quizId) {
  await ensureQuizImagesBucket();
  const safeFolder =
    String(quizId || "quiz")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "quiz";
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[mimeType] || "img";
  const filePath = `quizzes/${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { error } = await supabaseClient.storage
    .from(QUIZ_IMAGES_BUCKET_NAME)
    .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false });
  if (error)
    throw new Error(`Supabase quiz-image upload failed: ${error.message}`);
  return filePath;
}

async function getQuizImageSignedUrl(filePath, expiresInSeconds = 3600) {
  await ensureQuizImagesBucket();
  const { data, error } = await supabaseClient.storage
    .from(QUIZ_IMAGES_BUCKET_NAME)
    .createSignedUrl(filePath, expiresInSeconds);
  if (error || !data) {
    throw new Error(
      `Supabase quiz-image signed URL failed: ${error ? error.message : "empty response"}`,
    );
  }
  return data.signedUrl;
}

module.exports = { uploadQuizImage, getQuizImageSignedUrl, isAllowedQuizImage };
