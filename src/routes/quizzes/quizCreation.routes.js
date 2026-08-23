/**
 * quizCreation.routes.js
 * ---------------------------------------------------------------------------
 * TEACHER-ONLY endpoints for building a quiz:
 *   POST /api/quizzes                        create the quiz shell
 *   GET  /api/quizzes/:quizId                full quiz metadata
 *   GET  /api/lessons/:lessonId/quizzes      quizzes attached to a lesson
 *   POST /api/quizzes/:quizId/questions      add ONE question (mcq|written),
 *                                            optionally with an image file
 *   GET  /api/quizzes/:quizId/questions      FULL questions incl. answers
 *
 * All of these sit behind requireAuth + requireTeacher. Students never get
 * correct answers from here â€” that is enforced by only exposing the full
 * question list on this teacher-gated router.
 */

const express = require("express");
const multer = require("multer");

const { requireAuth } = require("../../middleware/auth.middleware.js");
const {
  requireTeacher,
  attachImageUrls,
} = require("./quiz.helpers.js");
const {
  createQuiz,
  getQuizById,
  getQuizzesForLesson,
  addQuestionToQuiz,
  getQuestionsForQuiz,
} = require("../../services/quiz.stub.service.js");
const {
  uploadQuizImage,
  isAllowedQuizImage,
} = require("../../services/supabaseStorage.service.js");
const {
  createNotificationForEnrolledStudents,
} = require("../../services/notifications.stub.service.js");

const router = express.Router();

/**
 * âš ï¸ WHY PER-ROUTE MIDDLEWARE (not router.use): all quiz sub-routers share
 * the same mount point under /api. A router-level .use(requireTeacher) here
 * would ALSO intercept student requests passing through toward the taking
 * router (Express runs sub-routers in mount order). Attaching the gates per
 * route keeps each group fully isolated.
 */

/** Images stay in memory; 5MB is plenty for a phone photo of a formula. */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
});

/**
 * Validates and parses the create-quiz body.
 * Split into its own function so the route handler stays readable.
 *
 * @param {object} body - req.body from the teacher's form.
 * @returns {object|null} Normalized fields, or null when invalid.
 */
function parseCreateQuizBody(body) {
  const lessonId = String((body && body.lessonId) || "").trim();
  const title = String((body && body.title) || "").trim();
  const courseId = String((body && body.courseId) || "").trim();
  const questionCount = Number(body && body.questionCount);
  const startTime = Date.parse(body && body.startTime);
  const endTime = Date.parse(body && body.endTime);
  const durationMinutes = Number(body && body.durationMinutes);

  if (!lessonId || !title) return null;
  if (!Number.isInteger(questionCount) || questionCount < 1) return null;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (endTime <= startTime) return null; // window must make sense
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  return {
    lessonId,
    title,
    courseId: courseId || null,
    questionCount,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(endTime).toISOString(),
    durationMinutes,
  };
}

/**
 * POST /api/quizzes â€” create the quiz shell (no questions yet).
 */
router.post("/quizzes", requireAuth, requireTeacher, async (req, res) => {
  const fields = parseCreateQuizBody(req.body);

  if (!fields) {
    return res.status(400).json({
      error:
        "Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø©. ØªØ£ÙƒØ¯ÙŠ Ù…Ù† Ø§Ù„Ø¹Ù†ÙˆØ§Ù† ÙˆØ¹Ø¯Ø¯ Ø§Ù„Ø£Ø³Ø¦Ù„Ø© ÙˆÙˆÙ‚Øª Ø§Ù„Ø¨Ø¯Ø§ÙŠØ©/Ø§Ù„Ù†Ù‡Ø§ÙŠØ© ÙˆÙ…Ø¯Ø© Ø§Ù„Ø­Ù„.",
    });
  }

  const quiz = await createQuiz(fields);

  // PUBLISH NOTIFICATION - reuses the SHARED helper from the notifications
  // feature (never a second implementation). Fired after the quiz exists,
  // deliberately non-blocking: a notification outage must never fail
  // quiz creation.
  createNotificationForEnrolledStudents(
    quiz.courseId || "biology",
    `اختبار جديد: ${quiz.title} — افتحي صفحة الاختبارات لبدء الحل.`,
    "/exams.html"
  ).catch((error) =>
    console.error("[quiz] publish notification failed:", error.message)
  );
  return res.status(201).json({ message: "ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±.", quiz });
});

/**
 * GET /api/quizzes/:quizId â€” metadata (teacher view).
 */
router.get("/quizzes/:quizId", requireAuth, requireTeacher, async (req, res) => {
  const quiz = await getQuizById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯." });
  return res.json({ quiz });
});

/**
 * GET /api/lessons/:lessonId/quizzes â€” all quizzes for one lesson page.
 */
router.get("/lessons/:lessonId/quizzes", requireAuth, requireTeacher, async (req, res) => {
  const quizzes = await getQuizzesForLesson(req.params.lessonId);
  return res.json({ quizzes });
});

/**
 * Validates an incoming question payload BEFORE anything is stored.
 * Keeping validation separate makes both content-type paths (JSON body vs
 * multipart form fields) share the exact same rules.
 *
 * @param {object} body - Parsed question fields.
 * @returns {object} { ok:boolean, error?:string, fields?:normalized }
 */
function validateQuestionPayload(body) {
  const type = String((body && body.type) || "").toLowerCase();
  const text = String((body && body.text) || "").trim();

  if (type !== "mcq" && type !== "written") {
    return { ok: false, error: "Ù†ÙˆØ¹ Ø§Ù„Ø³Ø¤Ø§Ù„ ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† mcq Ø£Ùˆ written." };
  }
  if (!text) {
    return { ok: false, error: "Ù†Øµ Ø§Ù„Ø³Ø¤Ø§Ù„ Ù…Ø·Ù„ÙˆØ¨." };
  }

  if (type === "mcq") {
    // The frontend sends choices as an array (JSON) or as choice1..choice4
    // form fields (multipart). Accept both shapes.
    let choices = Array.isArray(body.choices)
      ? body.choices
      : [body.choice1, body.choice2, body.choice3, body.choice4];

    choices = (choices || []).map((choice) => String(choice || "").trim());

    if (choices.length !== 4 || choices.some((choice) => !choice)) {
      return { ok: false, error: "Ø£Ø³Ø¦Ù„Ø© Ø§Ù„Ø§Ø®ØªÙŠØ§Ø±Ø§Øª ØªØ­ØªØ§Ø¬ Ù¤ Ø§Ø®ØªÙŠØ§Ø±Ø§Øª ÙƒØ§Ù…Ù„Ø©." };
    }

    const correctIndex = Number(body.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      return { ok: false, error: "Ø­Ø¯Ø¯ÙŠ Ø§Ù„Ø¥Ø¬Ø§Ø¨Ø© Ø§Ù„ØµØ­ÙŠØ­Ø© (correctIndex Ù ..Ù£)." };
    }

    return { ok: true, fields: { type, text, choices, correctIndex } };
  }

  // written â€” the model answer is required because it is what students will
  // compare against AFTER the quiz ends. It is never used for grading.
  const modelAnswer = String((body && body.modelAnswer) || "").trim();
  if (!modelAnswer) {
    return { ok: false, error: "Ø§Ù„Ø¥Ø¬Ø§Ø¨Ø© Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ÙŠØ© Ù…Ø·Ù„ÙˆØ¨Ø© Ù„Ù„Ø³Ø¤Ø§Ù„ Ø§Ù„Ù…Ù‚Ø§Ù„ÙŠ." };
  }
  return { ok: true, fields: { type, text, modelAnswer } };
}

/**
 * POST /api/quizzes/:quizId/questions â€” add one question.
 * Accepts application/json OR multipart/form-data with an optional `image`
 * file field (jpg/png/webp). The image is stored in Supabase and ONLY its
 * path is saved on the question record.
 */
router.post("/quizzes/:quizId/questions", requireAuth, requireTeacher, imageUpload.single("image"), async (req, res) => {
  const quiz = await getQuizById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯." });

  const validated = validateQuestionPayload(req.body);
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }

  // Reject wrong image types early with a clear Arabic message.
  if (req.file && !isAllowedQuizImage(req.file)) {
    return res.status(400).json({
      error: "ØµÙˆØ±Ø© Ø§Ù„Ø³Ø¤Ø§Ù„ ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† JPG Ø£Ùˆ PNG Ø£Ùˆ WEBP.",
    });
  }

  try {
    // Upload FIRST so a failed upload never leaves a question row pointing
    // at nothing (same order as the materials feature).
    let imagePath = null;
    if (req.file) {
      imagePath = await uploadQuizImage(
        req.file.buffer,
        req.file.mimetype,
        quiz.id
      );
    }

    const question = await addQuestionToQuiz(quiz.id, {
      ...validated.fields,
      imagePath,
    });

    return res.status(201).json({ message: "ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø³Ø¤Ø§Ù„.", question });
  } catch (error) {
    if (error.message === "QUIZ_QUESTION_LIMIT_REACHED") {
      return res.status(400).json({
        error: `ÙˆØµÙ„ØªÙ Ù„Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰ (${quiz.questionCount} Ø³Ø¤Ø§Ù„) Ù„Ù‡Ø°Ø§ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±.`,
      });
    }
    console.error("[quiz] add question failed:", error);
    return res.status(500).json({ error: "ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ø³Ø¤Ø§Ù„." });
  }
});

/**
 * GET /api/quizzes/:quizId/questions â€” FULL questions (teacher preview).
 * Includes correctChoiceId / modelAnswer BY DESIGN â€” this router is
 * teacher-gated, unlike the student taking flow which sanitizes.
 */
router.get("/quizzes/:quizId/questions", requireAuth, requireTeacher, async (req, res) => {
  const quiz = await getQuizById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯." });

  const questions = await getQuestionsForQuiz(quiz.id);
  await attachImageUrls(questions);
  return res.json({ quiz, questions });
});

module.exports = router;
