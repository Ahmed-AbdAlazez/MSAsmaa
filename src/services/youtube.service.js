/**
 * youtube.service.js
 * ---------------------------------------------------------------------------
 * Server-side validation and ID extraction for YouTube video URLs.
 */

/** Valid YouTube Video ID regex (exactly 11 chars of alphanumeric + _ + -) */
const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts a YouTube Video ID from any valid YouTube URL or raw 11-char ID.
 *
 * Supported formats:
 *   - https://www.youtube.com/watch?v=XXXXXXXXXXX
 *   - https://m.youtube.com/watch?v=XXXXXXXXXXX
 *   - https://youtu.be/XXXXXXXXXXX
 *   - https://www.youtube.com/embed/XXXXXXXXXXX
 *   - https://www.youtube.com/v/XXXXXXXXXXX
 *   - https://www.youtube.com/shorts/XXXXXXXXXXX
 *   - Raw 11-character ID (XXXXXXXXXXX)
 *
 * @param {string} input - YouTube URL or raw ID
 * @returns {string|null} 11-character Video ID, or null if invalid
 */
function extractYouTubeId(input) {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. If input contains URL protocol or domain symbols/slashes, treat strictly as URL
  if (trimmed.includes("://") || trimmed.includes(".") || trimmed.includes("/")) {
    try {
      const urlObj = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const host = urlObj.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

      if (host !== "youtube.com" && host !== "youtu.be" && host !== "youtube-nocookie.com") {
        return null;
      }

      if (host === "youtube.com" || host === "youtube-nocookie.com") {
        const vParam = urlObj.searchParams.get("v");
        if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
          return vParam;
        }

        const pathParts = urlObj.pathname.split("/").filter(Boolean);
        if (pathParts.length >= 2 && ["embed", "v", "shorts"].includes(pathParts[0])) {
          const potentialId = pathParts[1];
          if (YOUTUBE_ID_REGEX.test(potentialId)) {
            return potentialId;
          }
        }
      }

      if (host === "youtu.be") {
        const pathParts = urlObj.pathname.split("/").filter(Boolean);
        if (pathParts.length >= 1) {
          const potentialId = pathParts[0];
          if (YOUTUBE_ID_REGEX.test(potentialId)) {
            return potentialId;
          }
        }
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  // 2. Direct 11-character Video ID format (e.g. dQw4w9WgXcQ)
  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Validates a YouTube URL or Video ID string.
 *
 * @param {string} input
 * @returns {{ valid: boolean, videoId: string|null, error: string|null }}
 */
function validateYouTubeUrl(input) {
  if (!input || typeof input !== "string" || !input.trim()) {
    return {
      valid: false,
      videoId: null,
      error: "رابط فيديو يوتيوب مطلوب ولا يمكن أن يكون فارغاً.",
    };
  }

  const videoId = extractYouTubeId(input);
  if (!videoId) {
    return {
      valid: false,
      videoId: null,
      error: "رابط فيديو يوتيوب غير صالح. يُرجى إدخال رابط يوتيوب صحيح (مثال: https://www.youtube.com/watch?v=... أو https://youtu.be/...)",
    };
  }

  return {
    valid: true,
    videoId,
    error: null,
  };
}

module.exports = {
  extractYouTubeId,
  validateYouTubeUrl,
};
