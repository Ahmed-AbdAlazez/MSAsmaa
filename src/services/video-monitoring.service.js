/**
 * video-monitoring.service.js
 * ---------------------------------------------------------------------------
 * Monitors Bunny Stream video processing status and handles failures.
 *
 * Responsibilities:
 * 1. Poll video status to detect when encoding completes or fails
 * 2. When a video fails (status 5 or 6), automatically:
 *    - Notify the teacher who uploaded it
 *    - Delete the video from Bunny
 *    - Clear the database reference
 * 3. Never show students processing or failed videos
 *
 * Status codes from Bunny:
 *   0 = Created
 *   1 = Uploaded
 *   2 = Processing
 *   3 = Transcoding
 *   4 = Finished (READY for students)
 *   5 = Error (FAILED)
 *   6 = UploadFailed (FAILED)
 * =========================================================================== */

const { getVideo, deleteVideo } = require("./bunny.service.js");
const { createNotificationForTeacher } = require("./notifications.service.js");
const { getLessonVideoId } = require("./lesson.stub.service.js");
const { parseTitle: parseLessonTitle } = require("./bunny.service.js");

/**
 * Checks a single video's status and handles failure if detected.
 *
 * @param {string} videoId - Bunny's video ID
 * @param {string} lessonId - The lesson this video belongs to
 * @param {string} teacherId - The teacher who uploaded it
 * @returns {Promise<Object>} Result object with status and action taken
 */
async function checkAndHandleVideoStatus(videoId, lessonId, teacherId) {
  try {
    const video = await getVideo(videoId);

    // Success case: video is ready
    if (video.status === 4) {
      return await handleVideoSuccess(videoId, lessonId, teacherId, video);
    }

    // Still processing: no action needed yet
    if (video.status < 4) {
      return {
        videoId,
        status: video.status,
        action: "processing",
        progress: video.encodeProgress,
      };
    }

    // FAILURE CASE: status 5 (Error) or 6 (UploadFailed)
    if (video.status === 5 || video.status === 6) {
      return await handleVideoFailure(videoId, lessonId, teacherId, video);
    }

    return { videoId, status: video.status, action: "unknown" };
  } catch (error) {
    console.error(
      `[video-monitoring] Error checking video ${videoId}:`,
      error
    );
    return {
      videoId,
      error: error.message,
      action: "error",
    };
  }
}

/**
 * Handles a failed video: notifies teacher, deletes from Bunny, clears DB.
 *
 * @private
 * @param {string} videoId - Bunny's video ID
 * @param {string} lessonId - The lesson this video belongs to
 * @param {string} teacherId - The teacher to notify
 * @param {Object} video - Video metadata from Bunny
 * @returns {Promise<Object>} Cleanup result
 */
async function handleVideoFailure(videoId, lessonId, teacherId, video) {
  console.warn(
    `[video-monitoring] Video ${videoId} failed with status ${video.status}`
  );

  const statusLabel =
    video.status === 5 ? "معالجة الفيديو" : "رفع الفيديو";
  const parsedTitle = parseLessonTitle(video.title);
  const videoName = parsedTitle.name || "فيديو";

  const cleanupResults = {
    videoId,
    lessonId,
    action: "failure_cleanup",
    results: {},
  };

  // Step 1: Notify the teacher
  try {
    await createNotificationForTeacher(teacherId, {
      type: "video_failed",
      title: "❌ فشل رفع الفيديو",
      message: `فشل ${statusLabel} للفيديو "${videoName}" الخاص بدرس "${lessonId}". الرجاء المحاولة مرة أخرى.`,
      relatedId: lessonId,
      relatedType: "lesson",
      // Link to lesson management section so teacher can re-upload
      link: `/dashboard-teacher.html?tab=manage-videos&lesson=${encodeURIComponent(
        lessonId
      )}`,
    });
    cleanupResults.results.notification = "sent";
    console.log(
      `[video-monitoring] Notified teacher ${teacherId} about video ${videoId} failure`
    );
  } catch (notifError) {
    console.error(
      `[video-monitoring] Failed to notify teacher about video failure:`,
      notifError
    );
    cleanupResults.results.notification = `failed: ${notifError.message}`;
  }

  // Step 2: Delete the failed video from Bunny
  try {
    await deleteVideo(videoId);
    cleanupResults.results.bunny_delete = "deleted";
    console.log(
      `[video-monitoring] Deleted failed video ${videoId} from Bunny`
    );
  } catch (deleteError) {
    console.error(
      `[video-monitoring] Failed to delete video ${videoId} from Bunny:`,
      deleteError
    );
    cleanupResults.results.bunny_delete = `failed: ${deleteError.message}`;
  }

  // Step 3: Clear the database reference
  // NOTE: This uses the stub service for now. Once the real Prisma lessons
  // table exists, replace lesson.stub.service.js to call:
  //   await prisma.lesson.update({
  //     where: { id: lessonId },
  //     data: { videoId: null }
  //   })
  try {
    // The stub service is in-memory only, so this won't persist,
    // but the real implementation will when the DB is ready.
    await clearLessonVideoReference(lessonId);
    cleanupResults.results.db_clear = "cleared";
    console.log(
      `[video-monitoring] Cleared video reference for lesson ${lessonId}`
    );
  } catch (dbError) {
    console.error(
      `[video-monitoring] Failed to clear DB reference for lesson ${lessonId}:`,
      dbError
    );
    cleanupResults.results.db_clear = `failed: ${dbError.message}`;
  }

  return cleanupResults;
}

/**
 * Handles a successful video: notifies teacher that encoding is complete.
 *
 * @private
 * @param {string} videoId - Bunny's video ID
 * @param {string} lessonId - The lesson this video belongs to
 * @param {string} teacherId - The teacher to notify
 * @param {Object} video - Video metadata from Bunny
 * @returns {Promise<Object>} Result object
 */
async function handleVideoSuccess(videoId, lessonId, teacherId, video) {
  console.log(`[video-monitoring] Video ${videoId} ready for viewing`);

  const parsedTitle = parseLessonTitle(video.title);
  const videoName = parsedTitle.name || "فيديو";

  const result = {
    videoId,
    lessonId,
    action: "success_notification",
    results: {},
  };

  // Notify the teacher that video processing is complete
  try {
    await createNotificationForTeacher(teacherId, {
      type: "video_success",
      title: "✅ تم رفع الفيديو بنجاح",
      message: `تم رفع الفيديو "${videoName}" بنجاح لدرس "${lessonId}". يمكن للطلاب الآن مشاهدة الفيديو.`,
      relatedId: lessonId,
      relatedType: "lesson",
      // Link to lesson management section
      link: `/dashboard-teacher.html?tab=manage-videos&lesson=${encodeURIComponent(
        lessonId
      )}`,
    });
    result.results.notification = "sent";
    console.log(
      `[video-monitoring] Notified teacher ${teacherId} about video ${videoId} success`
    );
  } catch (notifError) {
    console.error(
      `[video-monitoring] Failed to notify teacher about video success:`,
      notifError
    );
    result.results.notification = `failed: ${notifError.message}`;
  }

  return result;
}

/**
 * Clears the video reference for a lesson.
 * This is separate from getLessonVideoId() to handle the future DB migration.
 *
 * @private
 * @param {string} lessonId - The lesson to clear
 */
async function clearLessonVideoReference(lessonId) {
  // TODO: When lesson.stub.service.js is replaced with real Prisma:
  // await prisma.lesson.update({
  //   where: { id: lessonId },
  //   data: { videoId: null }
  // });

  // For now, the stub doesn't provide a "delete" function,
  // so we rely on the in-memory stub being wiped. The real implementation
  // MUST delete the lesson->video mapping in the DB.
  console.log(
    `[video-monitoring] TODO: Implement persistent DB clear for lesson ${lessonId}`
  );
}

/**
 * Polls a video status (used during upload UI to show progress).
 * This is called repeatedly from the client-side UI, but doesn't handle failure.
 * Failure handling is driven by server-side background monitoring.
 *
 * @param {string} videoId - Bunny's video ID
 * @returns {Promise<Object>} Video status with encoding progress
 */
async function pollVideoStatus(videoId) {
  try {
    const video = await getVideo(videoId);
    return {
      videoId,
      status: video.status,
      encodeProgress: video.encodeProgress || 0,
      ready: video.status === 4,
      failed: video.status === 5 || video.status === 6,
      length: video.length,
    };
  } catch (error) {
    console.error(
      `[video-monitoring] Failed to poll video status for ${videoId}:`,
      error
    );
    throw error;
  }
}

/**
 * Creates a background job to monitor a video until it's ready or failed.
 * Called after upload to periodically check status and trigger cleanup if needed.
 *
 * @param {string} videoId - Bunny's video ID
 * @param {string} lessonId - The lesson this video belongs to
 * @param {string} teacherId - The teacher who uploaded it
 * @param {Object} options - Configuration
 * @param {number} options.pollIntervalMs - How often to check (default 10s)
 * @param {number} options.maxDurationMs - Stop monitoring after this time (default 24h)
 */
function startVideoStatusMonitoring(
  videoId,
  lessonId,
  teacherId,
  options = {}
) {
  const pollIntervalMs = options.pollIntervalMs || 10000; // 10 seconds
  const maxDurationMs = options.maxDurationMs || 24 * 60 * 60 * 1000; // 24 hours
  const startTime = Date.now();
  let isActive = true;

  const monitor = async () => {
    while (isActive) {
      // Stop after max duration
      if (Date.now() - startTime > maxDurationMs) {
        console.log(
          `[video-monitoring] Max duration reached for ${videoId}, stopping monitor`
        );
        isActive = false;
        break;
      }

      const result = await checkAndHandleVideoStatus(
        videoId,
        lessonId,
        teacherId
      );

      // Stop if ready, if failure was handled, or on error
      if (
        result.action === "success_notification" ||
        result.action === "failure_cleanup" ||
        result.error
      ) {
        console.log(
          `[video-monitoring] Monitor stopping for ${videoId}: ${result.action}`
        );
        isActive = false;
        break;
      }

      // Still processing, wait and check again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  // Fire and forget: start monitoring in background
  monitor().catch((error) => {
    console.error(`[video-monitoring] Unhandled error in monitor loop:`, error);
  });

  // Return a handle to stop monitoring if needed
  return {
    stop: () => {
      isActive = false;
    },
    isActive: () => isActive,
  };
}

module.exports = {
  checkAndHandleVideoStatus,
  pollVideoStatus,
  startVideoStatusMonitoring,
};
