/**
 * quizGrading.service.js
 * ---------------------------------------------------------------------------
 * PURE server-side grading logic for quizzes (no database access at all).
 *
 * RULES THIS FILE ENFORCES (from the platform requirements):
 *   1. ONLY multiple-choice questions are graded.
 *   2. Written questions are saved for display but NEVER scored, NEVER get a
 *      right/wrong verdict — not here, not anywhere else in the codebase.
 *   3. The score is "how many MCQs the student answered correctly".
 *
 * Keeping this as pure functions makes it trivially testable: pass questions
 * + answers in, get the score out. The routes call this on every submission
 * (manual or automatic) before persisting via quiz.stub.service.js.
 */

/**
 * Grades one attempt against the full question list.
 *
 * @param {object[]} questions - FULL question records (with correctChoiceId).
 *                               Safe to pass even though we only read MCQ
 *                               fields — written data is ignored entirely.
 * @param {object} answers     - Map of questionId -> submitted value
 *                               (choice id string for mcq, text for written).
 * @returns {object} { score, totalMcq }
 *   score    - number of correctly answered MCQ questions (0..totalMcq)
 *   totalMcq - how many MCQ questions exist (the denominator students see)
 */
function gradeSubmission(questions, answers) {
  const mcqQuestions = questions.filter((q) => q.type === "mcq");

  let score = 0;
  for (const question of mcqQuestions) {
    const submitted = answers[question.id];
    // Compare by choice ID (stable), not by choice text (editable).
    if (submitted && String(submitted.value) === question.correctChoiceId) {
      score += 1;
    }
  }

  return { score, totalMcq: mcqQuestions.length };
}

module.exports = { gradeSubmission };
