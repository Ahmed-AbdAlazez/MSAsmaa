/**
 * enrollment.service.js
 * ===========================================================================
 * Access-control gate for ALL biology curriculum content (lesson videos and
 * PDF materials).
 *
 * Previously this was a stub that returned TRUE for every caller, which meant
 * ANY authenticated user (student or not, approved or not) could watch every
 * lesson video and download every PDF for free. That is no longer the case.
 *
 * REAL BEHAVIOUR NOW:
 *   Whoever asks for content must be a registered user who either:
 *     - is the TEACHER (content owner, full access), OR
 *     - is a STUDENT whose registration has been APPROVED by the teacher.
 *
 *   PENDING and REJECTED students are BLOCKED. Unknown / deleted users are
 *   blocked. This is the single point that gates:
 *       GET /api/lessons/:lessonId/video-url     (video playback)
 *       GET /api/lessons/:lessonId/videos        (video list + playback)
 *       GET /api/lessons/:lessonId/materials     (PDF list)
 *       GET /api/materials/:materialId/download  (PDF download URLs)
 *       GET /api/lessons/:lessonId/notes         (lesson notes)
 *
 * The function stays async and keeps its original signature so callers never
 * change. A false result MUST always lead to a 403 Forbidden upstream.
 */

const { prisma } = require("../config/db");

/**
 * Checks whether a user is allowed to access a lesson's curriculum content.
 *
 * @param {string} studentId - ID of the user asking for the content.
 * @param {string} lessonId  - ID of the lesson they want to access
 *                             (unused today; kept for a future enrollment
 *                             table that ties students to specific courses).
 * @returns {Promise<boolean>} true if allowed, false otherwise.
 */
async function isStudentEnrolledInLessonCourse(studentId, lessonId) {
  if (!studentId) {
    return false;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: String(studentId) },
      select: { role: true, status: true },
    });

    if (!user) {
      return false;
    }

    // The teacher is the content owner and always has access.
    if (user.role === "TEACHER") {
      return true;
    }

    // Students must be approved by the teacher before accessing the
    // curriculum. PENDING / REJECTED students are blocked.
    return user.role === "STUDENT" && user.status === "APPROVED";
  } catch (error) {
    console.error("[enrollment] access-control check error:", error);
    // Fail closed: if we cannot verify who the user is, deny access.
    return false;
  }
}

module.exports = { isStudentEnrolledInLessonCourse };
