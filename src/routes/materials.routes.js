const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth.middleware.js");
const {
  isStudentEnrolledInLessonCourse,
} = require("../services/enrollment.stub.service.js");
const {
  saveMaterialRecord,
  getMaterialsForLesson,
  getMaterialById,
  getMaterialByDriveFileId,
  updateMaterialTitle,
  deleteMaterial,
  isTeacherOwnerOfLesson,
} = require("../services/material.stub.service.js");
const {
  uploadPdf,
  createPdfUploadSession,
  getPdfMetadata,
  deletePdf,
  isDriveReauthorizationError,
  ensurePublicReadable,
  getPdfViewUrl,
  getPdfDownloadUrl,
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

const UPLOAD_TOKEN_TTL = "60m";

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

function getUploadTokenSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured in environment variables");
  }
  return process.env.JWT_SECRET;
}

function signMaterialUploadToken(payload) {
  return jwt.sign(payload, getUploadTokenSecret(), {
    expiresIn: UPLOAD_TOKEN_TTL,
  });
}

function verifyMaterialUploadToken(token) {
  return jwt.verify(token, getUploadTokenSecret());
}

function validatePdfUploadDetails(fileName, mimeType, sizeBytes) {
  const parsedSize = Number(sizeBytes);
  if (
    mimeType !== "application/pdf" ||
    !/\.pdf$/i.test(String(fileName || "")) ||
    !Number.isSafeInteger(parsedSize) ||
    parsedSize <= 0 ||
    parsedSize > MAX_PDF_SIZE_BYTES
  ) {
    throw new AppError("يُسمح فقط بملفات PDF بحجم 20 ميجابايت أو أقل.", 400);
  }
  return parsedSize;
}

async function ensureTeacherOwnsLesson(req, next) {
  if (!(await isTeacherOwnerOfLesson(req.user.id, req.params.lessonId))) {
    next(new AppError("أنت لا تملك الكورس الذي يتبع له هذا الدرس.", 403));
    return false;
  }
  return true;
}

/** Makes a Drive PDF "anyone with the link" readable so browsers can open
 *  the preview/download URL directly (bytes never pass through Vercel). */
function bestEffortShare(fileId) {
  return ensurePublicReadable(fileId).catch((error) =>
    console.warn(
      "[materials] Failed to share PDF by link:",
      error && error.message,
    ),
  );
}

async function completeDirectUpload(req, res, next) {
  let uploadClaims;
  try {
    uploadClaims = verifyMaterialUploadToken(req.body?.uploadToken);
  } catch (_) {
    return next(new AppError("Upload session is invalid or expired.", 400));
  }

  if (
    uploadClaims.id !== req.user.id ||
    uploadClaims.role !== req.user.role ||
    uploadClaims.lessonId !== String(req.params.lessonId)
  ) {
    return next(new AppError("You are not allowed to complete this upload.", 403));
  }
  if (!(await ensureTeacherOwnsLesson(req, next))) return;

  const fileId = String(
    req.body?.fileId || req.body?.driveFileId || uploadClaims.fileId || "",
  ).trim();
  if (!fileId) return next(new AppError("Google Drive file id is required.", 400));
  if (uploadClaims.fileId && fileId !== uploadClaims.fileId) {
    return next(new AppError("Uploaded file does not match this upload session.", 403));
  }

  let driveFile;
  try {
    driveFile = await getPdfMetadata(fileId);
  } catch (error) {
    console.error(
      "[materials] Google Drive upload verification failed:",
      error.message,
    );
    return next(new AppError("Could not verify uploaded PDF in Google Drive.", 500));
  }

const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  const actualSize = Number(driveFile.size);
  // Validate against the parent recorded in the upload token at session
  // creation time (falling back to env only for tokens that lack the claim).
  const expectedParent =
    uploadClaims.parentId === undefined ? folderId : uploadClaims.parentId;
  const validFile =
    driveFile.id === fileId &&
    driveFile.mimeType === "application/pdf" &&
    /\.pdf$/i.test(driveFile.name || "") &&
    Number.isSafeInteger(actualSize) &&
    actualSize > 0 &&
    actualSize <= MAX_PDF_SIZE_BYTES &&
    (!uploadClaims.sizeBytes || actualSize === Number(uploadClaims.sizeBytes)) &&
    (!expectedParent ||
      !Array.isArray(driveFile.parents) ||
      driveFile.parents.includes(expectedParent));

  if (!validFile) {
    return next(new AppError("Uploaded PDF is invalid.", 400));
  }

  await bestEffortShare(fileId);

  const existingMaterial = await getMaterialByDriveFileId(fileId);
  if (existingMaterial) {
    if (existingMaterial.lessonId !== String(req.params.lessonId)) {
      return next(new AppError("You are not allowed to complete this upload.", 403));
    }
    return res.status(201).json({
      message: "PDF material uploaded successfully.",
      lessonId: req.params.lessonId,
      material: { id: existingMaterial.id, title: existingMaterial.title },
    });
  }

  let material;
  try {
    material = await saveMaterialRecord(
      req.params.lessonId,
      uploadClaims.title || driveFile.name,
      driveFile,
    );
  } catch (error) {
    await deletePdf(fileId).catch((cleanupError) =>
      console.error(
        "[materials] Orphaned Drive PDF cleanup failed:",
        cleanupError.message,
      ),
    );
    throw error;
  }

  return res.status(201).json({
    message: "PDF material uploaded successfully.",
    lessonId: req.params.lessonId,
    material: { id: material.id, title: material.title },
  });
}

router.post(
  "/lessons/:lessonId/materials/upload-session",
  requireAuth,
  requireTeacher,
  catchAsync(async (req, res, next) => {
    if (!(await ensureTeacherOwnsLesson(req, next))) return;

    const fileName = String(req.body?.fileName || "").trim();
    const mimeType = String(req.body?.mimeType || "")
      .trim()
      .toLowerCase();
    const sizeBytes = validatePdfUploadDetails(
      fileName,
      mimeType,
      req.body?.sizeBytes,
    );
    const title = String(req.body?.title || fileName)
      .replace(/\s+/g, " ")
      .trim();

    try {
      const session = await createPdfUploadSession(fileName, sizeBytes);
      const uploadToken = signMaterialUploadToken({
        id: req.user.id,
        role: req.user.role,
        lessonId: String(req.params.lessonId),
        fileName: session.fileName,
        fileId: session.fileId,
        title,
        sizeBytes,
        parentId: session.parentId || null,
      });
      return res.json({
        uploadUrl: session.uploadUrl,
        fileId: session.fileId,
        uploadToken,
      });
    } catch (error) {
      console.error(
        "[materials] Google Drive upload session failed:",
        error.message,
      );
      return next(
        new AppError("تعذر تجهيز رفع ملف PDF إلى Google Drive.", 500),
      );
    }
  }),
);

router.post(
  "/lessons/:lessonId/materials/complete-upload",
  requireAuth,
  requireTeacher,
  catchAsync(async (req, res, next) => {
    let uploadClaims;
    try {
      uploadClaims = verifyMaterialUploadToken(req.body?.uploadToken);
    } catch (_) {
      return next(new AppError("جلسة رفع ملف PDF غير صالحة أو منتهية.", 400));
    }

    if (
      uploadClaims.id !== req.user.id ||
      uploadClaims.role !== req.user.role ||
      uploadClaims.lessonId !== String(req.params.lessonId)
    ) {
      return next(new AppError("لا تملك صلاحية إكمال رفع هذا الملف.", 403));
    }
    if (!(await ensureTeacherOwnsLesson(req, next))) return;

    const fileId = String(req.body?.fileId || uploadClaims.fileId || "").trim();
    if (!fileId) return next(new AppError("معرف ملف Google Drive مطلوب.", 400));
    if (uploadClaims.fileId && fileId !== uploadClaims.fileId) {
      return next(new AppError("Uploaded file does not match this upload session.", 403));
    }

    let driveFile;
    try {
      driveFile = await getPdfMetadata(fileId);
    } catch (error) {
      console.error(
        "[materials] Google Drive upload verification failed:",
        error.message,
      );
      return next(new AppError("تعذر التحقق من ملف PDF في Google Drive.", 500));
    }

const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
    const actualSize = Number(driveFile.size);
    // Validate against the parent recorded in the upload token at session
    // creation time. A token without a parent claim (old tokens) falls back
    // to the current env; a token with parentId null means the session had
    // to create the file without a folder, so skip the parents check.
    // This is immune to GOOGLE_DRIVE_FOLDER_ID changing between session
    // creation and completion (or differing across warm lambdas), which
    // caused "ملف PDF المرفوع غير صالح" for otherwise valid uploads.
    const expectedParent =
      uploadClaims.parentId === undefined ? folderId : uploadClaims.parentId;
    const validFile =
      driveFile.id === fileId &&
      driveFile.mimeType === "application/pdf" &&
      /\.pdf$/i.test(driveFile.name || "") &&
      Number.isSafeInteger(actualSize) &&
      actualSize > 0 &&
      actualSize <= MAX_PDF_SIZE_BYTES &&
      (!uploadClaims.sizeBytes || actualSize === Number(uploadClaims.sizeBytes)) &&
      (!expectedParent ||
        !Array.isArray(driveFile.parents) ||
        driveFile.parents.includes(expectedParent));

    if (!validFile) {
      return next(new AppError("ملف PDF المرفوع غير صالح.", 400));
    }

    await bestEffortShare(fileId);

    const existingMaterial = await getMaterialByDriveFileId(fileId);
    if (existingMaterial) {
      if (existingMaterial.lessonId !== String(req.params.lessonId)) {
        return next(new AppError("لا تملك صلاحية إكمال رفع هذا الملف.", 403));
      }
      return res.status(201).json({
        message: "تم رفع مادة PDF بنجاح.",
        lessonId: req.params.lessonId,
        material: { id: existingMaterial.id, title: existingMaterial.title },
      });
    }

    let material;
    try {
      material = await saveMaterialRecord(
        req.params.lessonId,
        uploadClaims.title,
        driveFile,
      );
    } catch (error) {
      await deletePdf(fileId).catch((cleanupError) =>
        console.error(
          "[materials] Orphaned Drive PDF cleanup failed:",
          cleanupError.message,
        ),
      );
      throw error;
    }

    return res.status(201).json({
      message: "تم رفع مادة PDF بنجاح.",
      lessonId: req.params.lessonId,
      material: { id: material.id, title: material.title },
    });
  }),
);

router.post(
  "/lessons/:lessonId/materials/upload-url",
  requireAuth,
  requireTeacher,
  catchAsync(async (req, res, next) => {
    const fileName = String(req.body?.fileName || req.body?.title || "material.pdf").trim();
    const mimeType = String(req.body?.mimeType || "application/pdf").trim().toLowerCase();
    try {
      if (!(await ensureTeacherOwnsLesson(req, next))) return;
      const sizeBytes = validatePdfUploadDetails(
        fileName,
        mimeType,
        req.body?.sizeBytes || MAX_PDF_SIZE_BYTES,
      );
      const session = await createPdfUploadSession(fileName, sizeBytes);
      const uploadToken = signMaterialUploadToken({
        id: req.user.id,
        role: req.user.role,
        lessonId: String(req.params.lessonId),
        fileName: session.fileName,
        fileId: session.fileId,
        title: String(req.body?.title || fileName).replace(/\s+/g, " ").trim(),
        sizeBytes,
      });
      return res.json({
        uploadUrl: session.uploadUrl,
        fileId: session.fileId,
        uploadToken,
      });
    } catch (error) {
      console.error("[materials] Failed to create direct upload URL:", error.message);
      return next(new AppError("فشل إنشاء رابط الرفع المباشر إلى Google Drive. يرجى التأكد من التوثيق.", 500));
    }
  })
);

router.post(
  "/lessons/:lessonId/materials/confirm",
  requireAuth,
  requireTeacher,
  catchAsync(async (req, res, next) => {
    if (req.body?.uploadToken) {
      return completeDirectUpload(req, res, next);
    }
    return next(new AppError("Upload token is required to confirm a PDF upload.", 400));
    const { driveFileId, title, fileName, sizeBytes } = req.body || {};
    if (!driveFileId) {
      return next(new AppError("معرف ملف Google Drive (driveFileId) مطلوب.", 400));
    }
    const cleanMaterialTitle = String(title || fileName || "مادة الدرس").replace(/\s+/g, " ").trim();
    const driveFileObj = {
      id: String(driveFileId),
      name: String(fileName || cleanMaterialTitle || "material.pdf"),
      mimeType: "application/pdf",
      size: sizeBytes ? Number(sizeBytes) : null,
    };
    const material = await saveMaterialRecord(
      req.params.lessonId,
      cleanMaterialTitle,
      driveFileObj
    );
    await bestEffortShare(String(driveFileId));
    return res.status(201).json({
      message: "تم حفظ مادة PDF بنجاح.",
      lessonId: req.params.lessonId,
      material: { id: material.id, title: material.title },
    });
  })
);

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
    let driveFile;
    try {
      driveFile = await uploadPdf(buffer, req.file.originalname);
    } catch (error) {
      console.error("[materials] Google Drive upload failed:", error.message);
      const errMessage = String(error.message || "");
      if (
        isDriveReauthorizationError(error) ||
        errMessage.includes("expired or revoked") ||
        errMessage.includes("invalid_client")
      ) {
        return next(
          new AppError(
            "فشل رفع الملف إلى Google Drive لأن رمز OAuth أصبح غير صالح أو أُلغي. شغّل محلياً: node src/scripts/authorize-google-drive.js ثم حدّث GOOGLE_OAUTH_REFRESH_TOKEN في Vercel Environment Variables بالقيمة الجديدة وأعد النشر.",
            500,
          ),
        );
      }
      if (errMessage.includes("configuration is incomplete")) {
        return next(
          new AppError("إعدادات Google Drive غير مكتملة في الخادم.", 500),
        );
      }
      return next(
        new AppError(
          `فشل رفع ملف PDF إلى Google Drive: ${errMessage || "خطأ غير معروف"}`,
          500,
        ),
      );
    }

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
        new AppError("أنت غير مسجل في الكورس الذي يتبع له هذا الدرس.", 403),
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
        new AppError("أنت غير مسجل في الكورس الذي تتبع له هذه المادة.", 403),
      );
    }
    await bestEffortShare(material.fileId);
    return res.json({ downloadUrl: getPdfDownloadUrl(material.fileId) });
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
      return next(new AppError("لا تملك صلاحية عرض ملف PDF هذا.", 403));
    }

    await bestEffortShare(material.fileId);
    return res.json({ viewUrl: getPdfViewUrl(material.fileId) });
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
        new AppError("أنت لا تملك الكورس الذي تتبع له هذه المادة.", 403),
      );
    await updateMaterialTitle(material.id, title, material.fileId);
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
        new AppError("أنت لا تملك الكورس الذي تتبع له هذه المادة.", 403),
      );
    await deleteMaterial(material.id, material.fileId);
    return res.json({ message: "تم حذف المادة بنجاح." });
  }),
);

module.exports = router;
