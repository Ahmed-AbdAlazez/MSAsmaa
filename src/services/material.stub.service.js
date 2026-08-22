/**
 * material.stub.service.js
 * ===========================================================================
 * REPLACE THIS STUB - DO NOT SHIP TO PRODUCTION
 * ===========================================================================
 *
 * These functions are TEMPORARY stand-ins for storing and reading lesson PDF
 * material records. They must be swapped for real Prisma calls once the
 * database schema is finalized. Do not deploy to production with this stub
 * still in place.
 *
 * WHAT IS FAKE RIGHT NOW:
 *   Material records are stored in a plain in-memory JavaScript object
 *   (materialsById below). That object lives only inside the running Node
 *   process and is wiped on every restart.
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
 *
 * WHAT BREAKS IF YOU NEVER REPLACE IT:
 *   - Restarting the server wipes every material record.
 *   - Running more than one server instance breaks because each process has
 *     its own private fake storage.
 * ===========================================================================
 */

const materialsById = {};
let nextMaterialNumber = 1;

/**
 * Creates the next temporary material ID for the in-memory stub.
 * The real database version should use the database primary key instead.
 *
 * @returns {string} A predictable fake material ID.
 */
function buildMaterialId() {
  const materialId = `material-${nextMaterialNumber}`;
  nextMaterialNumber += 1;
  return materialId;
}

/**
 * Saves a material record for a lesson.
 * The uploaded PDF file already lives in Supabase Storage; this record is the
 * server-side pointer that connects the lesson, title, and storage path.
 *
 * @param {string} lessonId - The lesson this PDF belongs to.
 * @param {string} title - The teacher-facing material title.
 * @param {string} filePath - The private Supabase Storage object path.
 * @returns {Promise<object>} The saved material record.
 */
async function saveMaterialRecord(lessonId, title, filePath) {
  // TODO(REPLACE-STUB): real implementation must insert into a materials table.
  const materialId = buildMaterialId();
  const materialRecord = {
    id: materialId,
    lessonId,
    title,
    filePath,
    createdAt: new Date().toISOString(),
  };

  materialsById[materialId] = materialRecord;
  return materialRecord;
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
  return Object.values(materialsById).filter(
    (materialRecord) => materialRecord.lessonId === lessonId
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
  return materialsById[materialId] || null;
}

module.exports = {
  saveMaterialRecord,
  getMaterialsForLesson,
  getMaterialById,
};
