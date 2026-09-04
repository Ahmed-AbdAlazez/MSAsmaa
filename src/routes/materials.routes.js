const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth.middleware.js");
const {
  isStudentEnrolledInLessonCourse,
} = require("../services/enrollment.stub.service.js");
const {
  saveMaterialRecord,
  getMaterialsForLesson,
  getMaterialById,
  updateMaterialTitle,
  deleteMaterial,
  isTeacherOwnerOfLesson,
} = require("../services/material.stub.service.js");
const {
  uploadPdf,
  getPdfStream,
} = require("../services/googleDriveStorage.service.js");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { normalizePdf } = require("../services/pdfNormalize.service.js");

const router = express.Router();
const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE_BYTES },
});

function requireTeacher(req, res, next) {
  if (req.user.role !== "teacher") {
    return res
      .status(403)
      .json({ error: "المعلمات فقط يمكنهن إدارة ملفات الدرس." });
  }
  return next();
}

function uploadSinglePdf(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      return next(
        new AppError(
          "فشل رفع ملف PDF. يجب أن يكون حجم الملف 20 ميجابايت أو أقل.",
          400,
        ),
      );
    }
    return next(new AppError("فشل رفع ملف PDF. يرجى إرسال ملف PDF واحد.", 400));
  });
}

function cleanTitle(req) {
  return String(req.body?.title || req.file?.originalname || "مادة الدرس")
    .replace(/\s+/g, " ")
    .trim();
}

router.post(
  "/lessons/:lessonId/materials",
  requireAuth,
  requireTeacher,
  uploadSinglePdf,
  catchAsync(async (req, res, next) => {
    if (
      !req.file ||
      req.file.mimetype !== "application/pdf" ||
      !/\.pdf$/i.test(req.file.originalname || "")
    ) {
      return next(new AppError("يُسمح فقط بملفات PDF لمواد الدرس.", 400));
    }
    let buffer = req.file.buffer;
    try {
      const normalized = await normalizePdf(buffer, req.params.lessonId);
      buffer = normalized.buffer;
    } catch (error) {
      console.error("[materials] PDF normalization skipped:", error.message);
    }
    const driveFile = await uploadPdf(buffer, req.file.originalname);
    const material = await saveMaterialRecord(
      req.params.lessonId,
      cleanTitle(req),
      driveFile,
    );
    return res.status(201).json({
      message: "تم رفع مادة PDF بنجاح.",
      lessonId: req.params.lessonId,
      material: { id: material.id, title: material.title },
    });
  }),
);

router.get(
  "/lessons/:lessonId/materials",
  requireAuth,
  catchAsync(async (req, res, next) => {
    if (
      !(await isStudentEnrolledInLessonCourse(req.user.id, req.params.lessonId))
    ) {
      return next(
        new AppError("أنت غير مسجلة في الكورس الذي يتبع له هذا الدرس.", 403),
      );
    }
    const materials = await getMaterialsForLesson(req.params.lessonId);
    return res.json({
      lessonId: req.params.lessonId,
      materials: materials.map(({ id, title }) => ({ id, title })),
    });
  }),
);

router.get(
  "/materials/:materialId/download",
  requireAuth,
  catchAsync(async (req, res, next) => {
    const material = await getMaterialById(req.params.materialId);
    if (!material) return next(new AppError("المادة غير موجودة.", 404));
    if (
      !(await isStudentEnrolledInLessonCourse(req.user.id, material.lessonId))
    ) {
      return next(
        new AppError("أنت غير مسجلة في الكورس الذي تتبع له هذه المادة.", 403),
      );
    }
    try {
      const stream = await getPdfStream(material.fileId);
      const disposition =
        req.query.mode === "inline"
          ? "inline"
          : `attachment; filename="${encodeURIComponent(material.fileName)}"`;
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
      });
      stream.on("error", () => {
        if (!res.headersSent)
          next(new AppError("فشل تحميل ملف PDF. يرجى المحاولة لاحقاً.", 500));
      });
      return stream.pipe(res);
    } catch (error) {
      console.error("[materials] PDF stream failed:", error.message);
      return next(
        new AppError("فشل تحميل ملف PDF. يرجى المحاولة لاحقاً.", 500),
      );
    }
  }),
);

router.get(
  "/materials/:materialId/view",
  requireAuth,
  catchAsync(async (req, res, next) => {
    const material = await getMaterialById(req.params.materialId);
    if (!material) return next(new AppError("المادة غير موجودة.", 404));

    const hasAccess =
      req.user.role === "teacher"
        ? await isTeacherOwnerOfLesson(req.user.id, material.lessonId)
        : req.user.role === "student" &&
          (await isStudentEnrolledInLessonCourse(
            req.user.id,
            material.lessonId,
          ));

    if (!hasAccess) {
      return next(new AppError("لا تملكين صلاحية عرض ملف PDF هذا.", 403));
    }

    try {
      const stream = await getPdfStream(material.fileId);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      });
      stream.on("error", () => {
        if (!res.headersSent)
          next(new AppError("فشل تحميل ملف PDF. يرجى المحاولة لاحقاً.", 500));
      });
      return stream.pipe(res);
    } catch (error) {
      console.error("[materials] PDF view failed:", error.message);
      return next(new AppError("فشل فتح ملف PDF. يرجى المحاولة لاحقاً.", 500));
    }
  }),
);

router.get(
  "/lessons/:lessonId/materials/manage",
  requireAuth,
  requireTeacher,
  catchAsync(async (req, res) => {
    const materials = await getMaterialsForLesson(req.params.lessonId);
    return res.json({
      lessonId: req.params.lessonId,
      materials: materials.map(({ id, title, createdAt, sizeBytes }) => ({
        id,
        title,
        createdAt,
        sizeBytes: sizeBytes == null ? null : Number(sizeBytes),
      })),
    });
  }),
);

router.patch(
  "/materials/:materialId",
  requireAuth,
  requireTeacher,
  catchAsync(async (req, res, next) => {
    const title = String(req.body?.title || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!title)
      return next(new AppError("العنوان مطلوب ولا يمكن أن يكون فارغاً.", 400));
    const material = await getMaterialById(req.params.materialId);
    if (!material) return next(new AppError("المادة غير موجودة.", 404));
    if (!(await isTeacherOwnerOfLesson(req.user.id, material.lessonId)))
      return next(
        new AppError("أنت لا تملكين الكورس الذي تتبع له هذه المادة.", 403),
      );
    await updateMaterialTitle(material.id, title);
    return res.json({
      message: "تم حفظ التعديلات بنجاح.",
      materialId: material.id,
      title,
    });
  }),
);

router.delete(
  "/materials/:materialId",
  requireAuth,
  requireTeacher,
  catchAsync(async (req, res, next) => {
    const material = await getMaterialById(req.params.materialId);
    if (!material) return next(new AppError("المادة غير موجودة.", 404));
    if (!(await isTeacherOwnerOfLesson(req.user.id, material.lessonId)))
      return next(
        new AppError("أنت لا تملكين الكورس الذي تتبع له هذه المادة.", 403),
      );
    await deleteMaterial(material.id);
    return res.json({ message: "تم حذف المادة بنجاح." });
  }),
);

module.exports = router;
