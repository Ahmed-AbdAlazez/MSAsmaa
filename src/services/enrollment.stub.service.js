/**
 * enrollment.stub.service.js
 * ===========================================================================
 * ⚠️⚠️⚠️  REPLACE THIS STUB — DO NOT SHIP TO PRODUCTION  ⚠️⚠️⚠️
 * ===========================================================================
 *
 * This file is a TEMPORARY stand-in for the real enrollment check.
 *
 * It must be connected to the real "enrollments" table once the database
 * schema is finalized. Do not deploy to production with this stub still in
 * place.
 *
 * WHAT IS FAKE RIGHT NOW:
 *   isStudentEnrolledInLessonCourse() below ALWAYS returns true, meaning
 *   every logged-in user (student or not) passes the access-control check
 *   in GET /api/lessons/:lessonId/video-url and receives a playable video
 *   URL. In other words: while this stub is active, ALL VIDEOS ARE PUBLIC
 *   TO ANY AUTHENTICATED USER.
 *
 * HOW TO REPLACE IT (one file only):
 *   Rewrite the function body below to query the real database, e.g.:
 *
 *     async function isStudentEnrolledInLessonCourse(studentId, lessonId) {
 *       const enrollment = await prisma.enrollment.findFirst({
 *         where: {
 *           studentId: studentId,
 *           lessonId:  lessonId,   // adjust to your real schema relations:
 *                                  // you may need to go lesson -> unit ->
 *                                  // course -> enrollments depending on how
 *                                  // the schema ends up being modelled.
 *         },
 *       });
 *       return enrollment !== null;
 *     }
 *
 *   Keep the same function NAME, the same parameters and the same
 *   true/false return contract. Nothing else in the codebase needs to
 *   change, because every caller imports the function from THIS file.
 *
 * WHAT BREAKS IF YOU NEVER REPLACE IT:
 *   - Any authenticated user can watch ANY lesson video for free.
 *   - Paid courses have zero enforcement — the whole business model leaks.
 * ===========================================================================
 */

/**
 * Checks whether a student is allowed to watch videos of a given lesson.
 *
 * STUB BEHAVIOUR: always returns true ("everyone is enrolled").
 * REAL BEHAVIOUR (after replacement): queries the enrollments table and
 * returns true only if an enrollment row links this student to the course
 * that contains this lesson.
 *
 * The function is async ON PURPOSE: the real database version will be async,
 * so callers already "await" it today. Replacing the stub later then requires
 * zero changes in the calling code.
 *
 * @param {string} studentId - ID of the user asking for the video.
 * @param {string} lessonId  - ID of the lesson they want to watch.
 * @returns {Promise<boolean>} true if enrolled, false otherwise.
 */
async function isStudentEnrolledInLessonCourse(studentId, lessonId) {
  // TODO(REPLACE-STUB): real implementation must query the enrollments table.
  console.warn(
    "[STUB] isStudentEnrolledInLessonCourse() always returns true — " +
      "replace enrollment.stub.service.js before production!"
  );
  return true;
}

module.exports = { isStudentEnrolledInLessonCourse };
