/**
 * quiz.helpers.js
 * ---------------------------------------------------------------------------
 * Shared helpers used by every quiz route group. Nothing here talks to the
 * database or to Supabase directly except attachImageUrls (which only builds
 * signed display URLs). Splitting these out keeps each routes file focused on
 * its own flow (creation / taking / results / leaderboard / review).
 */

const {
  getQuizImageSignedUrl,
} = require("../../services/supabaseStorage.service.js");

/**
 * Express middleware: rejects non-teachers from teacher-only endpoints.
 * req.user.role is set by requireAuth from the VERIFIED JWT — it can never
 * be claimed by the client through a header.
 */
function requireTeacher(request, response, next) {
  if (!request.user || request.user.role !== "teacher") {
    return response.status(403).json({
      error: "Only teachers can do this.",
    });
  }
  return next();
}

/** Same gate for students, so student-only endpoints stay student-only. */
function requireStudent(request, response, next) {
  if (!request.user || request.user.role !== "student") {
    return response.status(403).json({
      error: "Only students can take quizzes.",
    });
  }
  return next();
}

/* ------------------------------------------------------------------ *
 * TIME MATH
 * The whole timing model hangs off three server-side instants:
 *   quiz.startTime      window opens (same for everyone)
 *   quiz.endTime        hard wall for EVERYONE (auto-submit)
 *   attempt.personalDeadline = startedAt + durationMinutes (per student)
 * Whichever of endTime / personalDeadline comes FIRST cuts the student off.
 * ------------------------------------------------------------------ */

/**
 * The instant this attempt is cut off, whichever limit hits first.
 *
 * @param {object} attempt - An attempt record (has startedAt/personalDeadline).
 * @param {object} quiz    - The quiz record (has endTime).
 * @returns {number} Cutoff epoch milliseconds.
 */
function effectiveDeadlineMs(attempt, quiz) {
  const personal = Date.parse(attempt.personalDeadline);
  const overall = Date.parse(quiz.endTime);
  return Math.min(personal, overall);
}

/**
 * Seconds still left before this attempt is auto-cut-off.
 *
 * @param {object} attempt - The in-progress attempt.
 * @param {object} quiz    - The quiz.
 * @returns {number} Whole seconds remaining (0 when already expired).
 */
function remainingSeconds(attempt, quiz) {
  const left = effectiveDeadlineMs(attempt, quiz) - Date.now();
  return Math.max(0, Math.floor(left / 1000));
}

/**
 * Whether "now" is inside the quiz's visibility/attempt window.
 *
 * @param {object} quiz - The quiz.
 * @returns {boolean} True when startTime <= now <= endTime.
 */
function isWithinQuizWindow(quiz) {
  const now = Date.now();
  return (
    now >= Date.parse(quiz.startTime) && now <= Date.parse(quiz.endTime)
  );
}

/**
 * Why an attempt would be (or was) auto-cut-off — used for messages and for
 * the submissionReason stored on finalized attempts.
 *
 * @param {object} attempt - The attempt.
 * @param {object} quiz    - The quiz.
 * @returns {string} 'auto-personal-timer' | 'auto-quiz-end' | null
 */
function expiryReason(attempt, quiz) {
  const now = Date.now();
  if (now < Date.parse(attempt.personalDeadline) && now < Date.parse(quiz.endTime)) {
    return null; // nothing expired yet
  }
  // Personal timer ran out no later than the quiz end? Then it "won".
  // If the quiz end_time is earlier (or equal), THAT cut the student off —
  // even when their personal countdown still showed time remaining.
  return Date.parse(quiz.endTime) <= Date.parse(attempt.personalDeadline)
    ? "auto-quiz-end"
    : "auto-personal-timer";
}

/* ------------------------------------------------------------------ *
 * QUESTION SANITIZING (answer-leak prevention)
 * ------------------------------------------------------------------ */

/**
 * Strips everything a student must never see while taking the quiz:
 *   - correctChoiceId (which MCQ choice is correct)
 *   - modelAnswer     (the written question's reference answer)
 * Only question text, choices, image and type survive. The review endpoint
 * is the ONLY place answers come back, and only after quiz end_time.
 *
 * @param {object} question - A FULL question record.
 * @returns {object} A safe copy for student responses.
 */
function sanitizeQuestionForStudent(question) {
  const safe = {
    id: question.id,
    order: question.order,
    type: question.type,
    text: question.text,
    imagePath: null,
    imageUrl: null,
  };

  if (question.type === "mcq") {
    // Choice IDs are sent because answers are submitted BY ID.
    safe.choices = question.choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
    }));
  }
  // written questions intentionally expose NOTHING besides text here.

  if (question.imagePath) {
    safe.imagePath = question.imagePath; // path alone leaks nothing useful
    safe.imageUrl = question.signedImageUrl || null;
  }

  return safe;
}

/**
 * Attaches short-lived signed display URLs to questions that have images.
 * Mutates `question.signedImageUrl` on the in-memory records so every later
 * sanitizer/view can pick it up. Signed URLs expire after ~1 hour; the next
 * request regenerates them.
 *
 * @param {object[]} questions - Full question records.
 * @returns {Promise<void>}
 */
async function attachImageUrls(questions) {
  await Promise.all(
    questions.map(async (question) => {
      if (!question.imagePath) return;
      try {
        question.signedImageUrl = await getQuizImageSignedUrl(
          question.imagePath,
          60 * 60
        );
      } catch (error) {
        // A broken/deleted image should not break the whole quiz response.
        console.error("[quiz] image sign failed:", error.message);
        question.signedImageUrl = null;
      }
    })
  );
}

module.exports = {
  requireTeacher,
  requireStudent,
  effectiveDeadlineMs,
  remainingSeconds,
  isWithinQuizWindow,
  expiryReason,
  sanitizeQuestionForStudent,
  attachImageUrls,
};
