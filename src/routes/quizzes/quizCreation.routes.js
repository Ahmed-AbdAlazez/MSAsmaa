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
const { requireTeacher, attachImageUrls } = require("./quiz.helpers.js");
const {
  createQuiz,
  getQuizById,
  getQuizzesForLesson,
  addQuestionToQuiz,
  getQuestionsForQuiz,
  getQuestionById,
  getQuizLessons,
} = require("../../services/quiz.stub.service.js");
const {
  isAllowedQuizImage,
} = require("../../services/supabaseStorage.service.js");
const {
  isStudentEnrolledInLessonCourse,
} = require("../../services/enrollment.stub.service.js");
const {
  uploadQuizImage,
  getImageStream,
} = require("../../services/googleDriveStorage.service.js");
const {
  createNotificationForApprovedStudents,
} = require("../../services/notifications.service.js");

const router = express.Router();

/**
 * ⚠️ WHY PER-ROUTE MIDDLEWARE (not router.use): all quiz sub-routers share
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
  const isMixed = Boolean(body && body.isMixed);
  const title = String((body && body.title) || "").trim();
  const courseId = String((body && body.courseId) || "").trim();
  const questionCount = Number(body && body.questionCount);
  const startTime = Date.parse(body && body.startTime);
  const endTime = Date.parse(body && body.endTime);
  const durationMinutes = Number(body && body.durationMinutes);

  if (!title) return null;
  if (!Number.isInteger(questionCount) || questionCount < 1) return null;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (endTime <= startTime) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const result = {
    isMixed,
    title,
    courseId: courseId || null,
    questionCount,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(endTime).toISOString(),
    durationMinutes,
  };

  if (isMixed) {
    // Mixed quiz: lessonIds is required, lessonId is not used
    const lessonIds = Array.isArray(body.lessonIds)
      ? body.lessonIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (lessonIds.length < 2) return null;
    result.lessonIds = lessonIds;
  } else {
    // Single-lesson quiz: lessonId is required
    const lessonId = String((body && body.lessonId) || "").trim();
    if (!lessonId) return null;
    result.lessonId = lessonId;
  }

  return result;
}

/**
 * POST /api/quizzes â€” create the quiz shell (no questions yet).
 */
router.post("/quizzes", requireAuth, requireTeacher, async (req, res) => {
  const fields = parseCreateQuizBody(req.body);

  if (!fields) {
    const isMixed = req.body && req.body.isMixed;
    const error = isMixed
      ? "بيانات الاختبار المجمع غير مكتملة. تأكدي من العنوان واختيار درسين على الأقل وتوقيت البداية/النهاية والمدة."
      : "بيانات الاختبار غير مكتملة. تأكدي من العنوان والدرس وعدد الأسئلة ووقت البداية/النهاية ومدة الحل.";
    return res.status(400).json({ error });
  }

  // Cross-course validation for mixed quizzes: all lessonIds must belong to the same course
  if (fields.isMixed && fields.lessonIds) {
    // Server-side safety net: validate lesson ID format via regex.
    // The real cross-course guard is in the frontend.
    const invalidIds = fields.lessonIds.filter(
      (id) => !/^lesson-\d+$/.test(id),
    );
    if (invalidIds.length > 0) {
      return res.status(400).json({
        error: `معرفات الدروس غير صحيحة: ${invalidIds.join(", ")}`,
      });
    }
  }

  const quiz = await createQuiz({ ...fields, createdByTeacherId: req.user.id });

  await createNotificationForApprovedStudents({
    type: "quiz",
    title: "امتحان جديد",
    message: `تم إضافة امتحان جديد: ${quiz.title}`,
    relatedId: quiz.id,
    relatedType: "quiz",
    link: `/exams?quiz=${encodeURIComponent(quiz.id)}`,
  });
  return res.status(201).json({ message: "تم إنشاء الاختبار.", quiz });
});

/**
 * GET /api/quizzes/:quizId â€” metadata (teacher view).
 */
router.get(
  "/quizzes/:quizId",
  requireAuth,
  requireTeacher,
  async (req, res) => {
    const quiz = await getQuizById(req.params.quizId);
    if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });
    // Attach lessonIds for mixed quizzes
    if (quiz.isMixed) {
      quiz.lessonIds = await getQuizLessons(quiz.id);
    }
    return res.json({ quiz });
  },
);

/**
 * GET /api/lessons/:lessonId/quizzes â€” all quizzes for one lesson page.
 */
router.get(
  "/lessons/:lessonId/quizzes",
  requireAuth,
  requireTeacher,
  async (req, res) => {
    const quizzes = await getQuizzesForLesson(req.params.lessonId);
    return res.json({ quizzes });
  },
);

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
    return { ok: false, error: "نوع السؤال يجب أن يكون mcq أو written." };
  }
  if (!text) {
    return { ok: false, error: "نص السؤال مطلوب." };
  }

  if (type === "mcq") {
    // The frontend sends choices as an array (JSON) or as choice1..choice4
    // form fields (multipart). Accept both shapes.
    let choices = Array.isArray(body.choices)
      ? body.choices
      : [body.choice1, body.choice2, body.choice3, body.choice4];

    choices = (choices || []).map((choice) => String(choice || "").trim());

    if (choices.length !== 4 || choices.some((choice) => !choice)) {
      return { ok: false, error: "أسئلة الاختيارات تحتاج ٤ اختيارات كاملة." };
    }

    const correctIndex = Number(body.correctIndex);
    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex > 3
    ) {
      return { ok: false, error: "حددي الإجابة الصحيحة (correctIndex ٠..٣)." };
    }

    return { ok: true, fields: { type, text, choices, correctIndex } };
  }

  // written â€” the model answer is required because it is what students will
  // compare against AFTER the quiz ends. It is never used for grading.
  const modelAnswer = String((body && body.modelAnswer) || "").trim();
  if (!modelAnswer) {
    return { ok: false, error: "الإجابة النموذجية مطلوبة للسؤال المقالي." };
  }
  return { ok: true, fields: { type, text, modelAnswer } };
}

/**
 * POST /api/quizzes/:quizId/questions â€” add one question.
 * Accepts application/json OR multipart/form-data with an optional `image`
 * file field (jpg/png/webp). New images are stored in the existing Drive
 * materials folder and ONLY their Drive file ID is saved on the question.
 */
router.post(
  "/quizzes/:quizId/questions",
  requireAuth,
  requireTeacher,
  imageUpload.single("image"),
  async (req, res) => {
    const quiz = await getQuizById(req.params.quizId);
    if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });

    const validated = validateQuestionPayload(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error });
    }

    // Reject wrong image types early with a clear Arabic message.
    if (req.file && !isAllowedQuizImage(req.file)) {
      return res.status(400).json({
        error: "صورة السؤال يجب أن تكون JPG أو PNG أو WEBP.",
      });
    }

    try {
      // Upload FIRST so a failed upload never leaves a question row pointing
      // at nothing (same order as the materials feature).
      let imagePath = null;
      if (req.file) {
        const driveFile = await uploadQuizImage(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
        );
        imagePath = driveFile.id;
      }

      const question = await addQuestionToQuiz(quiz.id, {
        ...validated.fields,
        imagePath,
      });

      return res.status(201).json({ message: "تمت إضافة السؤال.", question });
    } catch (error) {
      if (error.message === "QUIZ_QUESTION_LIMIT_REACHED") {
        return res.status(400).json({
          error: `وصلتِ للحد الأقصى (${quiz.questionCount} سؤال) لهذا الاختبار.`,
        });
      }
      console.error("[quiz] add question failed:", error);
      return res.status(500).json({ error: "تعذر حفظ السؤال." });
    }
  },
);

/**
 * GET /api/quizzes/:quizId/questions â€” FULL questions (teacher preview).
 * Includes correctChoiceId / modelAnswer BY DESIGN â€” this router is
 * teacher-gated, unlike the student taking flow which sanitizes.
 */
router.get(
  "/quizzes/:quizId/questions",
  requireAuth,
  requireTeacher,
  async (req, res) => {
    const quiz = await getQuizById(req.params.quizId);
    if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });

    const questions = await getQuestionsForQuiz(quiz.id);
    await attachImageUrls(questions, req);
    return res.json({ quiz, questions });
  },
);

router.get("/quizzes/questions/:questionId/image", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(401).end();
    const { verifyToken } = require("../../utils/jwt");
    const decoded = await verifyToken(token);
    req.user = {
      id: String(decoded.id),
      role: String(decoded.role || "student").toLowerCase(),
    };

    const record = await getQuestionById(req.params.questionId);
    if (!record || !record.question.imagePath) return res.status(404).end();

    let allowed = false;
    if (req.user.role === "teacher") {
      allowed = record.quiz.createdByTeacherId === req.user.id;
    } else if (req.user.role === "student") {
      const lessonIds = record.quiz.isMixed
        ? await getQuizLessons(record.quiz.id)
        : [record.quiz.lessonId];
      for (const lessonId of lessonIds.filter(Boolean)) {
        if (await isStudentEnrolledInLessonCourse(req.user.id, lessonId)) {
          allowed = true;
          break;
        }
      }
    }
    if (!allowed || String(record.question.imagePath).includes("/")) {
      return res.status(403).end();
    }

    const driveResponse = await getImageStream(record.question.imagePath);
    res.set({
      "Content-Type":
        driveResponse.headers["content-type"] || "application/octet-stream",
      "Content-Disposition": "inline",
    });
    return driveResponse.data.pipe(res);
  } catch (error) {
    console.error("[quiz] image stream failed:", error.message);
    return res.status(401).end();
  }
});

module.exports = router;
