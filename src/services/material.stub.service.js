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

const {
  listLessonPdfFiles,
  moveFile,
} = require("./supabaseStorage.service.js");

/**
 * Files whose display title was customized by a teacher are renamed inside
 * Supabase Storage to carry the encoded title in the object name:
 *   ttl_<encodeURIComponent(title)>--<original-base>.pdf
 * This keeps custom titles durable across serverless restarts without any
 * database table (the file name IS the record until the real DB lands).
 */
const TITLE_FILE_MARKER = "ttl_";
const TITLE_FILE_SEPARATOR = "--";

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
 * Removes a previously encoded custom-title marker from a file name so a
 * rename does not stack markers on top of each other.
 *
 * @param {string} fileName - The current stored file name.
 * @returns {string} The base name without any custom-title marker.
 */
function getFileNameWithoutCustomTitle(fileName) {
  if (!fileName.startsWith(TITLE_FILE_MARKER)) {
    return fileName;
  }

  const withoutMarker = fileName.slice(TITLE_FILE_MARKER.length);
  const separatorIndex = withoutMarker.indexOf(TITLE_FILE_SEPARATOR);
  return separatorIndex >= 0
    ? withoutMarker.slice(separatorIndex + TITLE_FILE_SEPARATOR.length)
    : withoutMarker;
}

/**
 * Converts a stored PDF filename into a readable title.
 * Custom teacher titles encoded in the file name win; otherwise the upload
 * timestamp/random prefix is stripped and the remaining base is shown.
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

  if (fileName.startsWith(TITLE_FILE_MARKER)) {
    const withoutMarker = fileName.slice(TITLE_FILE_MARKER.length);
    const separatorIndex = withoutMarker.indexOf(TITLE_FILE_SEPARATOR);

    if (separatorIndex > 0) {
      try {
        return decodeURIComponent(withoutMarker.slice(0, separatorIndex));
      } catch (error) {
        // Malformed encoding falls through to the plain-name branch below.
      }
    }
  }

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
 * @param {number|null} sizeBytes - File size in bytes (management view only).
 * @returns {object} A material record.
 */
function buildMaterialRecord(lessonId, title, filePath, createdAt, sizeBytes = null) {
  return {
    id: encodeMaterialId(filePath),
    lessonId,
    title: buildTitleFromFilePath(filePath, title),
    filePath,
    createdAt: createdAt || null,
    sizeBytes,
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
      storedFile.createdAt || storedFile.created_at,
      storedFile.sizeBytes
    )
  );
}

/**
 * Renames one material by moving its Supabase object to a marker-encoded
 * name that carries the new teacher-chosen title. Moving the file keeps the
 * custom title durable without any database table; every later list call
 * decodes it back automatically.
 *
 * TODO(REPLACE-STUB): with a real materials table this must become an
 * UPDATE of the title column, and the storage move can be dropped entirely
 * (the file name no longer needs to encode anything).
 *
 * @param {string} materialId - The material record ID (encoded file path).
 * @param {string} newTitle - The new teacher-facing title.
 * @returns {Promise<object|null>} The updated record, or null when the ID is invalid.
 */
async function updateMaterialTitle(materialId, newTitle) {
  // Titles collapse whitespace but keep ANY language/characters: they are
  // percent-encoded into the file name, so Arabic titles survive as-is.
  const cleanTitle = String(newTitle || "").replace(/\s+/g, " ").trim();

  const currentFilePath = decodeMaterialId(materialId);
  const lessonId = getLessonIdFromFilePath(currentFilePath);

  if (!currentFilePath || !lessonId) {
    return null;
  }

  const folderPath = currentFilePath.split("/").slice(0, -1).join("/");
  const currentFileName = currentFilePath.split("/").pop();
  const baseName = getFileNameWithoutCustomTitle(currentFileName).replace(
    /\.pdf$/i,
    ""
  );

  const newFilePath =
    `${folderPath}/${TITLE_FILE_MARKER}${encodeURIComponent(cleanTitle)}` +
    `${TITLE_FILE_SEPARATOR}${baseName}.pdf`;

  // Throws on failure so the route can answer 500 without pretending the
  // rename happened. Nothing else is persisted, so there is nothing to roll back.
  await moveFile(currentFilePath, newFilePath);

  return buildMaterialRecord(lessonId, "", newFilePath, null, null);
}

/**
 * Removes the record reference for a deleted material.
 *
 * TODO(REPLACE-STUB): with a real materials table this must DELETE the row
 * matched by primary key. Today records are derived from the storage path,
 * so once the storage file is gone there is no remaining reference to erase.
 *
 * @param {string} materialId - The material record ID (encoded file path).
 * @returns {Promise<boolean>} True when the ID was valid.
 */
async function deleteMaterialRecord(materialId) {
  const filePath = decodeMaterialId(materialId);

  if (!filePath || !getLessonIdFromFilePath(filePath)) {
    return false;
  }

  return true;
}

/**
 * Checks whether a teacher owns the course that contains a lesson.
 *
 * ===========================================================================
 * TODO(REPLACE-STUB): COURSE-OWNERSHIP CHECK IS CURRENTLY A STUB.
 * Video management has no ownership model yet either (single-teacher
 * platform), so for now EVERY authenticated teacher passes. When courses
 * gain a real owner column/table this must verify that teacherUserId owns
 * the course containing lessonId, returning false otherwise.
 * ===========================================================================
 *
 * @param {string} teacherUserId - The requesting teacher's user ID.
 * @param {string} lessonId - The lesson whose course ownership is checked.
 * @returns {Promise<boolean>} Always true until real ownership data exists.
 */
async function isTeacherOwnerOfLesson(teacherUserId, lessonId) {
  return true;
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
  updateMaterialTitle,
  deleteMaterialRecord,
  isTeacherOwnerOfLesson,
};
