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
const { Readable, Transform } = require("stream");

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
  getUpstreamFileStream,
} = require("../services/supabaseStorage.service.js");
const { normalizePdf } = require("../services/pdfNormalize.service.js");

const router = express.Router();

/** Teacher gate for the management routes, mirroring video-manage.routes.js. */
function requireTeacher(request, response, next) {
  if (request.user.role !== "teacher") {
    return response.status(403).json({
      error: "Only teachers can manage lesson materials.",
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
      error: "Failed to create the PDF download URL. Please try again later.",
    });
  }
});

/**
 * GET /api/materials/:materialId/view
 *
 * Same-origin PDF proxy for the inline lesson viewer. Mobile browsers —
 * Safari especially — refuse to render cross-origin URLs inside an iframe
 * and navigate away to the storage domain instead, so this route fetches
 * the private Supabase object itself and streams the bytes back as
 * application/pdf with Content-Disposition: inline. The client never sees
 * the storage URL.
 *
 * AUTH NOTE: an <iframe> request cannot carry custom auth headers, so the
 * identity may arrive via userId/role query params — mirroring exactly what
 * auth.middleware reads from headers. The enrollment gate below is the SAME
 * check used by GET /materials/:materialId/download.
 */
router.get("/materials/:materialId/view", async (request, response) => {
  const userId =
    request.headers["x-user-id"] || request.query.userId || null;
  const userRole =
    request.headers["x-user-role"] || request.query.role || null;

  if (!userId || !["student", "teacher"].includes(userRole)) {
    return response.status(401).json({ error: "Authentication required." });
  }

  const materialRecord = await getMaterialById(request.params.materialId);

  if (!materialRecord) {
    return response.status(404).json({ error: "Material not found." });
  }

  /* MAIN ACCESS CONTROL POINT FOR INLINE PDF VIEWING - DO NOT BYPASS.
   * Identical enrollment check to the download route above. */
  const studentIsEnrolled = await isStudentEnrolledInLessonCourse(
    userId,
    materialRecord.lessonId
  );

  if (!studentIsEnrolled) {
    return response.status(403).json({
      error: "You are not enrolled in the course this material belongs to.",
    });
  }

  try {
    // STREAMING PROXY: pipe Supabase's byte stream straight into the HTTP
    // response instead of buffering the whole file. Vercel caps buffered
    // function responses at ~4.5MB; streaming keeps any reasonable PDF
    // size working and keeps memory flat.
    const upstream = await getUpstreamFileStream(materialRecord.filePath);

    if (!upstream.ok || !upstream.body) {
      console.error(
        `[materials.routes] Storage stream failed for material ${request.params.materialId}: HTTP ${upstream.status}`
      );
      return response
        .status(502)
        .type("text/plain")
        .send("Failed to load the PDF from storage. Please try again later.");
    }

    // DEBUG: count the bytes actually piped to the client and compare with
    // what Supabase declared. A mismatch here means corruption in the pipe.
    const declaredLength = upstream.headers.get("content-length");
    const wasEncoded = upstream.headers.get("content-encoding");
    let pipedBytes = 0;
    const byteCounter = new Transform({
      transform(chunk, _encoding, callback) {
        pipedBytes += chunk.length;
        callback(null, chunk);
      },
      flush(callback) {
        console.log(
          `[materials.routes] view ${request.params.materialId}: ` +
            `status=${upstream.status} declaredLength=${declaredLength || "none"} ` +
            `contentEncoding=${wasEncoded || "identity"} pipedBytes=${pipedBytes}`
        );
        callback();
      },
    });

    const responseHeaders = {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="material.pdf"',
      "Cache-Control": "private, max-age=300",
    };
    // Only forward Content-Length when Supabase sent UNCOMPRESSED bytes.
    // fetch() transparently decompresses gzip/br responses, so a forwarded
    // compressed length would under-report the real byte count and the
    // browser would truncate the PDF mid-stream (corrupt file, HTTP 200).
    if (declaredLength && !wasEncoded) {
      responseHeaders["Content-Length"] = declaredLength;
    }
    response.set(responseHeaders);

    Readable.fromWeb(upstream.body).pipe(byteCounter).pipe(response);
  } catch (error) {
    console.error(
      `[materials.routes] Inline view failed for material ${request.params.materialId}:`,
      error
    );
    // Plain text (not JSON): this page can render inside a student iframe.
    if (!response.headersSent) {
      return response
        .status(502)
        .type("text/plain")
        .send("Failed to load the PDF from storage. Please try again later.");
    }
    response.end();
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
        error: "Failed to load the materials for management. Please try again later.",
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
      error: "A non-empty title is required.",
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
      error: "You do not own the course this material belongs to.",
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
      error: "You do not own the course this material belongs to.",
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
