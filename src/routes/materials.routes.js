/**
 * materials.routes.js
 * ---------------------------------------------------------------------------
 * Express routes for uploading lesson PDF materials to private Supabase
 * Storage and giving enrolled students short-lived download links.
 *
 * Mount this router under /api so these final endpoints are available:
 *   POST /api/lessons/:lessonId/materials
 *   GET  /api/lessons/:lessonId/materials
 *   GET  /api/materials/:materialId/download
 */

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
  deleteMaterialRecord,
  isTeacherOwnerOfLesson,
} = require("../services/material.stub.service.js");
const {
  uploadPdf,
  generateSignedDownloadUrl,
  deleteFile,
  createSignedUploadForLesson,
  overwritePdf,
  downloadPdfBytes,
} = require("../services/supabaseStorage.service.js");
const { normalizePdf } = require("../services/pdfNormalize.service.js");

const router = express.Router();

/** Teacher gate for the management routes, mirroring video-manage.routes.js. */
function requireTeacher(request, response, next) {
  if (request.user.role !== "teacher") {
    return response.status(403).json({
      error: "المعلمون فقط يمكنهم إدارة ملفات الدرس.",
    });
  }
  return next();
}

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_URL_LIFETIME_SECONDS = 60 * 60;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_SIZE_BYTES,
  },
});

/**
 * Checks whether an uploaded file looks like a PDF.
 * This catches both the browser-provided MIME type and the file extension so
 * common mistakes return a clear 400 response before Supabase is called.
 *
 * @param {object} uploadedFile - The multer file object.
 * @returns {boolean} True when the file is a PDF.
 */
function isPdfFile(uploadedFile) {
  if (!uploadedFile) {
    return false;
  }

  const hasPdfMimeType = uploadedFile.mimetype === "application/pdf";
  const hasPdfExtension = /\.pdf$/i.test(uploadedFile.originalname || "");

  return hasPdfMimeType && hasPdfExtension;
}

/**
 * Builds the title saved with a material record.
 * A provided form title wins, otherwise the original PDF filename becomes the
 * title so students see something useful in the materials list.
 *
 * @param {object} request - The Express request object.
 * @returns {string} The clean title for the material.
 */
function getMaterialTitle(request) {
  const submittedTitle = request.body && request.body.title;
  const fallbackTitle = request.file && request.file.originalname;

  return String(submittedTitle || fallbackTitle || "مادة الدرس")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converts multer upload errors into clear API responses.
 * This wrapper keeps the route handler focused on permissions, Supabase, and
 * records instead of mixing those concerns with multipart parsing details.
 *
 * @param {object} request - The Express request object.
 * @param {object} response - The Express response object.
 * @param {Function} next - Express next callback.
 * @returns {void}
 */
function uploadSinglePdf(request, response, next) {
  upload.single("file")(request, response, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return response.status(400).json({
        error: "فشل رفع ملف PDF. يجب أن يكون حجم الملف 20 ميجابايت أو أقل.",
      });
    }

    return response.status(400).json({
      error: "فشل رفع ملف PDF. يرجى إرسال ملف PDF واحد في حقل الملف.",
    });
  });
}

/**
 * POST /api/lessons/:lessonId/materials
 *
 * Lets a teacher upload a PDF for any lesson. Materials are independent of
 * videos, so this works whether the lesson already has a video, has no video,
 * or gets a video later.
 */
router.post(
  "/lessons/:lessonId/materials",
  requireAuth,
  uploadSinglePdf,
  async (request, response) => {
    if (request.user.role !== "teacher") {
      return response.status(403).json({
        error: "المعلمات فقط يمكنهن رفع ملفات مواد الدرس.",
      });
    }

    if (!request.file) {
      return response.status(400).json({
        error: "يرجى رفع ملف PDF باستخدام حقل الملف.",
      });
    }

    if (!isPdfFile(request.file)) {
      return response.status(400).json({
        error: "يُسمح فقط بملفات PDF لمواد الدرس.",
      });
    }

    try {
      // Automatic normalization: re-render + rebuild the PDF so files from
      // Word/AI tools (non-embedded fonts, odd structure) render correctly
      // in the viewer. Best-effort — failures fall back to original bytes.
      const normalization = await normalizePdf(
        request.file.buffer,
        request.params.lessonId
      );

      const filePath = await uploadPdf(
        normalization.buffer,
        request.file.originalname,
        request.params.lessonId
      );
      const materialRecord = await saveMaterialRecord(
        request.params.lessonId,
        getMaterialTitle(request),
        filePath
      );

      return response.status(201).json({
        message: "تم رفع مادة PDF بنجاح.",
        lessonId: request.params.lessonId,
        material: {
          id: materialRecord.id,
          title: materialRecord.title,
        },
      });
    } catch (error) {
      console.error(
        `[materials.routes] PDF upload failed for lesson ${request.params.lessonId}:`,
        error
      );
      return response.status(500).json({
        error: "فشل رفع مادة PDF. يرجى المحاولة لاحقاً.",
      });
    }
  }
);

/**
 * GET /api/lessons/:lessonId/materials
 *
 * Lists material IDs and titles after the same enrollment check used by video
 * playback. Download URLs are intentionally not returned from this list route.
 */
router.get("/lessons/:lessonId/materials", requireAuth, async (request, response) => {
  try {
    const studentIsEnrolled = await isStudentEnrolledInLessonCourse(
      request.user.id,
      request.params.lessonId
    );

    if (!studentIsEnrolled) {
      return response.status(403).json({
        error: "أنت غير مسجلة في الكورس الذي يتبع له هذا الدرس.",
      });
    }

    const materialRecords = await getMaterialsForLesson(request.params.lessonId);

    return response.json({
      lessonId: request.params.lessonId,
      materials: materialRecords.map((materialRecord) => ({
        id: materialRecord.id,
        title: materialRecord.title,
      })),
    });
  } catch (error) {
    console.error(
      `[materials.routes] Material list failed for lesson ${request.params.lessonId}:`,
      error
    );
    return response.status(500).json({
      error: "فشل تحميل ملفات PDF. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * GET /api/materials/:materialId/download
 * GET /api/materials/:materialId/download?mode=inline
 *
 * Returns a temporary signed URL for one PDF after access control passes.
 * Default mode forces the browser to download the file. With ?mode=inline
 * the URL renders the PDF inside an iframe on the lesson page instead.
 * The URL is generated on demand so it can expire quickly.
 */
router.get("/materials/:materialId/download", requireAuth, async (request, response) => {
  const materialRecord = await getMaterialById(request.params.materialId);

  if (!materialRecord) {
    return response.status(404).json({
      error: "المادة غير موجودة.",
    });
  }

  /* ======================================================================
   * MAIN ACCESS CONTROL POINT FOR PDF DOWNLOADS - DO NOT BYPASS
   * ======================================================================
   * This enrollment check matches the video playback pattern. The signed
   * Supabase URL must only be created after the server confirms the current
   * user is enrolled in the course that owns this material's lesson. Do not
   * move this check to the client, remove it, or return a URL when it fails.
   * ====================================================================== */
  const studentIsEnrolled = await isStudentEnrolledInLessonCourse(
    request.user.id,
    materialRecord.lessonId
  );

  if (!studentIsEnrolled) {
    return response.status(403).json({
      error: "أنت غير مسجلة في الكورس الذي تتبع له هذه المادة.",
    });
  }

  try {
    const inlineMode = request.query.mode === "inline";
    const downloadUrl = await generateSignedDownloadUrl(
      materialRecord.filePath,
      DOWNLOAD_URL_LIFETIME_SECONDS,
      { forceDownload: !inlineMode }
    );

    return response.json({
      materialId: materialRecord.id,
      lessonId: materialRecord.lessonId,
      inline: inlineMode,
      expiresInSeconds: DOWNLOAD_URL_LIFETIME_SECONDS,
      downloadUrl,
    });
  } catch (error) {
    console.error(
      `[materials.routes] Download URL failed for material ${request.params.materialId}:`,
      error
    );
    return response.status(500).json({
      error: "فشل إنشاء رابط تحميل PDF. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * POST /api/lessons/:lessonId/materials/upload-url
 *
 * Step 1 of DIRECT UPLOAD: hands the teacher a short-lived signed Supabase
 * upload URL. The browser PUTs the PDF bytes straight to storage, so the
 * file never travels through a Vercel function — this is what removes the
 * ~4.5MB request-body cap (413 errors) for large PDFs.
 */
router.post(
  "/lessons/:lessonId/materials/upload-url",
  requireAuth,
  requireTeacher,
  async (request, response) => {
    const lessonId = request.params.lessonId;
    const fileName =
      String((request.body && request.body.fileName) || "").trim() ||
      "lesson-material.pdf";

    try {
      const prepared = await createSignedUploadForLesson(fileName, lessonId);
      return response.json({
        lessonId,
        ...prepared,
        expiresInSeconds: DOWNLOAD_URL_LIFETIME_SECONDS,
      });
    } catch (error) {
      console.error(
        `[materials.routes] Signed upload URL failed for lesson ${lessonId}:`,
        error
      );
      return response.status(500).json({
        error: "فشل تجهيز الرفع المباشر. يرجى المحاولة لاحقاً.",
      });
    }
  }
);

/**
 * POST /api/materials/finalize
 *
 * Step 2 of DIRECT UPLOAD: after the browser PUT the bytes to storage, this
 * registers the material record and runs best-effort server-side
 * normalization (download -> rasterize -> overwrite) so Word/AI-generated
 * files render correctly everywhere.
 */
router.post("/materials/finalize", requireAuth, requireTeacher, async (request, response) => {
  const lessonId = String((request.body && request.body.lessonId) || "").trim();
  const filePath = String((request.body && request.body.filePath) || "").trim();
  const title = String((request.body && request.body.title) || "").trim();

  if (!lessonId || !filePath) {
    return response.status(400).json({
      error: "مطلوب معرف الدرس ومسار الملف.",
    });
  }

  // Guard: only accept paths inside this lesson's own folder, no traversal.
  const expectedPrefix = `lessons/${String(lessonId)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")}/`;
  if (!filePath.startsWith(expectedPrefix) || filePath.includes("..")) {
    return response.status(400).json({
      error: "مسار الملف لا يتبع هذا الدرس.",
    });
  }

  try {
    let normalized = false;
    try {
      const originalBytes = await downloadPdfBytes(filePath);
      // Normalize ONLY reasonably-sized files: broken-font problems come from
      // text documents (typically small). Big image-based/scanned PDFs already
      // render correctly everywhere, and rasterizing them costs minutes and
      // produces enormous outputs — skip them.
      const MAX_NORMALIZE_INPUT_BYTES = 4 * 1024 * 1024;
      if (
        originalBytes.length > 100 &&
        originalBytes.length <= MAX_NORMALIZE_INPUT_BYTES
      ) {
        const result = await normalizePdf(originalBytes, filePath);
        if (result.normalized) {
          await overwritePdf(filePath, result.buffer);
          normalized = true;
        }
      }
    } catch (normalizationError) {
      // Non-fatal: keep the original bytes rather than failing the upload.
      console.error(
        `[materials.routes] Normalization skipped for ${filePath}:`,
        normalizationError
      );
    }

    const materialRecord = await saveMaterialRecord(lessonId, title, filePath);

    return response.json({
      material: {
        id: materialRecord.id,
        lessonId,
        title: materialRecord.title,
        createdAt: materialRecord.createdAt,
      },
      normalized,
    });
  } catch (error) {
    console.error(
      `[materials.routes] Finalize failed for ${filePath}:`,
      error
    );
    return response.status(500).json({
      error: "فشل تسجيل ملف PDF المرفوع. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * GET /api/lessons/:lessonId/materials/manage
 *
 * Teacher-only management listing: returns every PDF attached to the lesson
 * with title, upload date and file size. Unlike the student list this is
 * gated by role only (the teacher dashboard needs full visibility) and
 * includes management-relevant fields students never receive.
 */
router.get(
  "/lessons/:lessonId/materials/manage",
  requireAuth,
  requireTeacher,
  async (request, response) => {
    try {
      const materialRecords = await getMaterialsForLesson(
        request.params.lessonId
      );

      return response.json({
        lessonId: request.params.lessonId,
        materials: materialRecords.map((materialRecord) => ({
          id: materialRecord.id,
          title: materialRecord.title,
          createdAt: materialRecord.createdAt,
          sizeBytes: materialRecord.sizeBytes,
        })),
      });
    } catch (error) {
      console.error(
        `[materials.routes] Manage list failed for lesson ${request.params.lessonId}:`,
        error
      );
      return response.status(500).json({
        error: "فشل تحميل المواد للإدارة. يرجى المحاولة لاحقاً.",
      });
    }
  }
);

/**
 * PATCH /api/materials/:materialId
 *
 * Renames one material. The new title must not be empty. After the basic
 * role gate the route confirms the teacher owns the course owning this
 * material before touching anything.
 */
router.patch("/materials/:materialId", requireAuth, requireTeacher, async (request, response) => {
  const newTitle = String((request.body && request.body.title) || "").trim();

  if (!newTitle) {
    return response.status(400).json({
      error: "العنوان مطلوب ولا يمكن أن يكون فارغاً.",
    });
  }

  const materialRecord = await getMaterialById(request.params.materialId);

  if (!materialRecord) {
    return response.status(404).json({
      error: "المادة غير موجودة.",
    });
  }

  // STUB OWNERSHIP CHECK - see isTeacherOwnerOfLesson in
  // material.stub.service.js. Video management has no ownership model yet;
  // until real course-ownership data exists every teacher passes.
  const teacherOwnsCourse = await isTeacherOwnerOfLesson(
    request.user.id,
    materialRecord.lessonId
  );

  if (!teacherOwnsCourse) {
    return response.status(403).json({
      error: "أنت لا تملكين الكورس الذي تتبع له هذه المادة.",
    });
  }

  try {
    await updateMaterialTitle(request.params.materialId, newTitle);

    return response.json({
      message: "تم حفظ التعديلات بنجاح.",
      materialId: request.params.materialId,
      title: newTitle,
    });
  } catch (error) {
    console.error(
      `[materials.routes] Rename failed for material ${request.params.materialId}:`,
      error
    );
    return response.status(500).json({
      error: "فشل حفظ التعديلات.",
    });
  }
});

/**
 * DELETE /api/materials/:materialId
 *
 * Permanently removes a material in TWO ordered steps:
 *   (a) delete the stored file from Supabase Storage via deleteFile();
 *   (b) ONLY if (a) succeeded, remove the record reference via
 *       deleteMaterialRecord().
 * This order prevents both mismatch states: a record pointing at an
 * existing file, or a file left behind with its record already gone.
 */
router.delete("/materials/:materialId", requireAuth, requireTeacher, async (request, response) => {
  const materialRecord = await getMaterialById(request.params.materialId);

  if (!materialRecord) {
    return response.status(404).json({
      error: "المادة غير موجودة.",
    });
  }

  // STUB OWNERSHIP CHECK - same caveat as the PATCH route above.
  const teacherOwnsCourse = await isTeacherOwnerOfLesson(
    request.user.id,
    materialRecord.lessonId
  );

  if (!teacherOwnsCourse) {
    return response.status(403).json({
      error: "أنت لا تملكين الكورس الذي تتبع له هذه المادة.",
    });
  }

  try {
    // Step (a): storage first. If this throws we stop WITHOUT deleting the
    // record, so no orphaned reference to a still-existing file can appear.
    await deleteFile(materialRecord.filePath);
  } catch (error) {
    console.error(
      `[materials.routes] Storage delete failed for material ${request.params.materialId}:`,
      error
    );
    return response.status(500).json({
      error:
        "تعذر حذف الملف من التخزين، لذلك لم يتم حذف سجل المادة. حاولي مرة أخرى.",
    });
  }

  try {
    // Step (b): record cleanup only after storage deletion succeeded.
    await deleteMaterialRecord(request.params.materialId);

    return response.json({ message: "تم حذف المادة بنجاح." });
  } catch (error) {
    console.error(
      `[materials.routes] Record delete failed for material ${request.params.materialId}:`,
      error
    );
    return response.status(500).json({
      error: "تم حذف الملف من التخزين لكن تعذر تحديث السجل.",
    });
  }
});

module.exports = router;
