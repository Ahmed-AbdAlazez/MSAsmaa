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
} = require("../services/material.stub.service.js");
const {
  uploadPdf,
  generateSignedDownloadUrl,
} = require("../services/supabaseStorage.service.js");

const router = express.Router();

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

  return String(submittedTitle || fallbackTitle || "Lesson material")
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
        error: "PDF upload failed. Files must be 20MB or smaller.",
      });
    }

    return response.status(400).json({
      error: "PDF upload failed. Please send one PDF file in the file field.",
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
        error: "Only teachers can upload lesson materials.",
      });
    }

    if (!request.file) {
      return response.status(400).json({
        error: "Please upload a PDF file using the file field.",
      });
    }

    if (!isPdfFile(request.file)) {
      return response.status(400).json({
        error: "Only PDF files are allowed for lesson materials.",
      });
    }

    try {
      const filePath = await uploadPdf(
        request.file.buffer,
        request.file.originalname,
        request.params.lessonId
      );
      const materialRecord = await saveMaterialRecord(
        request.params.lessonId,
        getMaterialTitle(request),
        filePath
      );

      return response.status(201).json({
        message: "PDF material uploaded successfully.",
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
        error: "Failed to upload the PDF material. Please try again later.",
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
        error: "You are not enrolled in the course this lesson belongs to.",
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
      error: "Failed to load the PDF materials. Please try again later.",
    });
  }
});

/**
 * GET /api/materials/:materialId/download
 *
 * Returns a temporary signed download URL for one PDF after access control
 * passes. The URL is generated on demand so it can expire quickly.
 */
router.get("/materials/:materialId/download", requireAuth, async (request, response) => {
  const materialRecord = await getMaterialById(request.params.materialId);

  if (!materialRecord) {
    return response.status(404).json({
      error: "Material not found.",
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
      error: "You are not enrolled in the course this material belongs to.",
    });
  }

  try {
    const downloadUrl = await generateSignedDownloadUrl(
      materialRecord.filePath,
      DOWNLOAD_URL_LIFETIME_SECONDS
    );

    return response.json({
      materialId: materialRecord.id,
      lessonId: materialRecord.lessonId,
      expiresInSeconds: DOWNLOAD_URL_LIFETIME_SECONDS,
      downloadUrl,
    });
  } catch (error) {
    console.error(
      `[materials.routes] Download URL failed for material ${request.params.materialId}:`,
      error
    );
    return response.status(500).json({
      error: "Failed to create the PDF download URL. Please try again later.",
    });
  }
});

module.exports = router;
