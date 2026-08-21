/**
 * lesson.stub.service.js
 * ===========================================================================
 * ⚠️⚠️⚠️  REPLACE THIS STUB — DO NOT SHIP TO PRODUCTION  ⚠️⚠️⚠️
 * ===========================================================================
 *
 * These functions are TEMPORARY stand-ins for storing/reading each lesson's
 * Bunny video ID. They must be swapped for real Prisma calls against the
 * "lessons" table once the database schema is finalized. Do not deploy to
 * production with these stubs still in place.
 *
 * WHAT IS FAKE RIGHT NOW:
 *   Video IDs are stored in a plain in-memory JavaScript object
 *   (lessonVideoIdsById below). That object lives only inside the running
 *   Node process.
 *
 * HOW TO REPLACE IT (one file only):
 *   Rewrite both function bodies as Prisma calls, e.g.:
 *
 *     async function saveLessonVideoId(lessonId, videoId) {
 *       await prisma.lesson.update({
 *         where: { id: lessonId },
 *         data:  { videoId: videoId },   // <- column name per final schema
 *       });
 *     }
 *
 *     async function getLessonVideoId(lessonId) {
 *       const lesson = await prisma.lesson.findUnique({
 *         where: { id: lessonId },
 *         select: { videoId: true },
 *       });
 *       return lesson ? lesson.videoId : null;
 *     }
 *
 *   Keep the same function NAMES, parameters and return contracts
 *   (getLessonVideoId MUST return null — not undefined, not an error —
 *   when the lesson exists but has no uploaded video yet). Callers import
 *   from THIS file, so nothing else in the codebase changes.
 *
 * WHAT BREAKS IF YOU NEVER REPLACE IT:
 *   - Restarting the server WIPES every saved video ID. Teachers would have
 *     to re-upload every video after each deploy/crash, and old Bunny videos
 *     would be orphaned forever.
 *   - Running more than one server instance (load balancing) breaks instantly,
 *     because each instance has its own private copy of the fake storage.
 * ===========================================================================
 */

/**
 * Fake storage: maps lessonId -> bunnyVideoId.
 * Starts empty every time the server process starts.
 */
const lessonVideoIdsById = {};

/**
 * Saves (or overwrites) the Bunny video ID for a lesson.
 *
 * STUB BEHAVIOUR: writes into the in-memory object above.
 * REAL BEHAVIOUR (after replacement): updates the lesson row in the database.
 *
 * Async on purpose so callers can await it today and keep working unchanged
 * when the real async Prisma version replaces this stub.
 *
 * @param {string} lessonId - The lesson the video belongs to.
 * @param {string} videoId  - Bunny's ID for the uploaded video ("guid").
 * @returns {Promise<void>}
 */
async function saveLessonVideoId(lessonId, videoId) {
  // TODO(REPLACE-STUB): real implementation must write to the lessons table.
  lessonVideoIdsById[lessonId] = videoId;
}

/**
 * Reads the stored Bunny video ID for a lesson.
 *
 * STUB BEHAVIOUR: reads from the in-memory object above.
 * REAL BEHAVIOUR (after replacement): reads the lesson row from the database.
 *
 * @param {string} lessonId - The lesson to look up.
 * @returns {Promise<string|null>} The stored video ID, or null when the
 *                                 lesson has no uploaded video yet.
 */
async function getLessonVideoId(lessonId) {
  // TODO(REPLACE-STUB): real implementation must read from the lessons table.
  if (lessonVideoIdsById[lessonId]) {
    return lessonVideoIdsById[lessonId];
  }

  // Serverless fallback (Vercel): each function invocation gets a fresh
  // empty memory, so the seeded demo lesson reads its video ID from the
  // environment instead. Keep until the real database lands.
  if (lessonId === "lesson-1" && process.env.LESSON_1_VIDEO_ID) {
    return process.env.LESSON_1_VIDEO_ID;
  }

  return null;
}

module.exports = { saveLessonVideoId, getLessonVideoId };
