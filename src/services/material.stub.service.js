/**
 * material.stub.service.js
 * ===========================================================================
 * REPLACE THIS STUB - DO NOT SHIP TO PRODUCTION
 * ===========================================================================
 *
 * These functions are TEMPORARY stand-ins for storing and reading lesson PDF
 * material records. To make the current production trial survive serverless
 * restarts, the fake material ID is an encoded Supabase Storage file path and
 * lesson lists are read from Supabase Storage folders.
 *
 * HOW TO REPLACE IT (one file only):
 *   Rewrite these function bodies as Prisma calls against a real materials
 *   table. A practical table shape would include:
 *
 *     id           string primary key
 *     lessonId     string foreign key to lessons.id
 *     title        string
 *     filePath     string Supabase Storage object path
 *     createdAt    datetime
 *
 *   Keep the same function names, parameters, and return contracts so the
 *   routes do not need to change when the real database lands.
 * ===========================================================================
 */

const { listLessonPdfFiles } = require("./supabaseStorage.service.js");

/**
 * Converts a string into a URL-safe base64 value.
 * Until the real database table exists, the material ID is the encoded
 * Supabase file path, so the ID survives production restarts.
 *
 * @param {string} value - The value to encode.
 * @returns {string} A URL-safe encoded value.
 */
function encodeMaterialId(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * Converts a URL-safe base64 material ID back into its Supabase file path.
 * Invalid IDs return null so routes can answer with a normal 404 instead of a
 * confusing decoding error.
 *
 * @param {string} materialId - The encoded material ID from the API.
 * @returns {string|null} The decoded Supabase file path, or null.
 */
function decodeMaterialId(materialId) {
  try {
    return Buffer.from(String(materialId || ""), "base64url").toString("utf8");
  } catch (error) {
    return null;
  }
}

/**
 * Extracts the lesson ID from a durable Supabase file path.
 * Paths are created as lessons/{lessonId}/{fileName}.pdf, which lets this stub
 * recover the lesson relationship after a server restart.
 *
 * @param {string} filePath - The Supabase Storage file path.
 * @returns {string|null} The lesson ID, or null when the path is invalid.
 */
function getLessonIdFromFilePath(filePath) {
  const match = String(filePath || "").match(/^lessons\/([^/]+)\/.+\.pdf$/i);
  return match ? match[1] : null;
}

/**
 * Converts a stored PDF filename into a readable title.
 * The upload path contains a timestamp and random suffix, so this removes that
 * technical prefix before showing the file to teachers and students.
 *
 * @param {string} filePath - The Supabase Storage file path.
 * @param {string} fallbackTitle - The submitted title from the upload form.
 * @returns {string} A readable title.
 */
function buildTitleFromFilePath(filePath, fallbackTitle) {
  if (fallbackTitle && fallbackTitle.trim()) {
    return fallbackTitle.trim();
  }

  const fileName = String(filePath || "").split("/").pop() || "material.pdf";
  return fileName
    .replace(/^\d+-[a-z0-9]+-/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/-/g, " ")
    .trim();
}

/**
 * Builds the public material record shape used by the routes.
 * This keeps all temporary ID/path conventions inside the stub service so the
 * routes can later work unchanged with real database rows.
 *
 * @param {string} lessonId - The lesson this PDF belongs to.
 * @param {string} title - The readable material title.
 * @param {string} filePath - The private Supabase Storage object path.
 * @param {string} createdAt - The file creation date.
 * @returns {object} A material record.
 */
function buildMaterialRecord(lessonId, title, filePath, createdAt) {
  return {
    id: encodeMaterialId(filePath),
    lessonId,
    title: buildTitleFromFilePath(filePath, title),
    filePath,
    createdAt: createdAt || null,
  };
}

/**
 * Saves a material record for a lesson.
 * The durable source of truth is currently the Supabase file path itself, so
 * this function returns a record shape without writing to process memory.
 *
 * @param {string} lessonId - The lesson this PDF belongs to.
 * @param {string} title - The teacher-facing material title.
 * @param {string} filePath - The private Supabase Storage object path.
 * @returns {Promise<object>} The saved material record.
 */
async function saveMaterialRecord(lessonId, title, filePath) {
  // TODO(REPLACE-STUB): real implementation must insert into a materials table.
  return buildMaterialRecord(lessonId, title, filePath, new Date().toISOString());
}

/**
 * Lists all material records attached to a lesson.
 * The route trims these records before responding so students see IDs and
 * titles first, not private file paths or signed download URLs.
 *
 * @param {string} lessonId - The lesson whose materials should be listed.
 * @returns {Promise<object[]>} Material records for the lesson.
 */
async function getMaterialsForLesson(lessonId) {
  // TODO(REPLACE-STUB): real implementation must query a materials table.
  const storedFiles = await listLessonPdfFiles(lessonId);
  return storedFiles.map((storedFile) =>
    buildMaterialRecord(
      lessonId,
      "",
      storedFile.filePath,
      storedFile.created_at || storedFile.createdAt
    )
  );
}

/**
 * Reads one material record by ID.
 * The download route uses this to find the associated lesson before it checks
 * enrollment and asks Supabase for a signed URL.
 *
 * @param {string} materialId - The material record ID.
 * @returns {Promise<object|null>} The material record, or null when missing.
 */
async function getMaterialById(materialId) {
  // TODO(REPLACE-STUB): real implementation must query a materials table.
  const filePath = decodeMaterialId(materialId);
  const lessonId = getLessonIdFromFilePath(filePath);

  if (!filePath || !lessonId) {
    return null;
  }

  return buildMaterialRecord(lessonId, "", filePath, null);
}

module.exports = {
  saveMaterialRecord,
  getMaterialsForLesson,
  getMaterialById,
};
