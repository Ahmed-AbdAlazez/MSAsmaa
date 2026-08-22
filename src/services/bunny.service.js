/**
 * bunny.service.js
 * ---------------------------------------------------------------------------
 * The ONLY file in this project that talks directly to the Bunny.net API.
 *
 * Why does this file exist?
 * Every place that needs to do something with Bunny (create a video, build an
 * upload URL, sign a playback URL) calls the functions in here instead of
 * making HTTP requests itself. That way, if Bunny ever changes its API, we
 * only have to fix this one file.
 *
 * SECURITY RULES for this file:
 *   - All secrets come from environment variables, loaded and validated at
 *       STARTUP by src/config/bunny.env.config.js (via dotenv):
 *       BUNNY_API_KEY     -> lets us create/upload videos
 *       BUNNY_LIBRARY_ID  -> which video library to use
 *       BUNNY_SIGNING_KEY -> lets us sign playback URLs
 *   - No key value is ever hardcoded here.
 *   - We deliberately do NOT use Bunny's DRM / watermarking add-on.
 *     Access control is done with short-lived signed URLs only.
 *
 * Requires Node.js 18+ because it uses the built-in global "fetch".
 */

const crypto = require("crypto");

// Requiring this runs the dotenv load + validation immediately. If anything
// is missing, the server crashes at startup with a clear error — which is
// exactly what we want (fail fast, fail loudly).
const bunnyEnv = require("../config/bunny.env.config.js");

/** Base URL for every Bunny Stream management/API call (create video, upload). */
const BUNNY_API_BASE_URL = "https://video.bunnycdn.com";

/**
 * Base URL for Bunny's universal embed player.
 * This hostname works for every Bunny Stream library without extra setup,
 * which is why we can sign playback URLs without needing a custom CDN
 * hostname environment variable.
 */
const BUNNY_EMBED_BASE_URL = "https://iframe.mediadelivery.net/embed";

/**
 * Default lifetime of a signed playback URL: 3 hours (in seconds).
 * After this window passes, the URL stops working and a fresh one must be
 * requested from GET /api/lessons/:lessonId/video-url. Short lifetimes are
 * what stop students from copying a link and sharing it forever.
 */
const DEFAULT_PLAYBACK_EXPIRY_SECONDS = 60 * 60 * 3;

/**
 * Creates an empty video entry inside the Bunny Stream library.
 *
 * Think of this as "reserving a slot" on Bunny's servers. Uploading happens
 * in a separate step (the client PUTs the file bytes to the URL returned by
 * getUploadUrl), but Bunny needs to know the video exists first so it can
 * hand out an ID for it.
 *
 * @param {string} title - Human-readable name for the video (shown in the
 *                         Bunny dashboard; also used as the default filename).
 * @returns {Promise<Object>} The created video object from Bunny. The field
 *                            we care about is "guid" — that is Bunny's ID for
 *                            the video (Bunny calls it GUID, we call it
 *                            videoId everywhere else in this project).
 * @throws {Error} If the network call fails or Bunny replies with an error.
 */
async function createVideo(title) {
  const libraryId = bunnyEnv.libraryId;
  const apiKey = bunnyEnv.apiKey;

  const response = await fetch(
    `${BUNNY_API_BASE_URL}/library/${libraryId}/videos`,
    {
      method: "POST",
      headers: {
        // Bunny authenticates every management-API call with this header.
        AccessKey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Bunny createVideo failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  return response.json();
}

/**
 * Builds the direct-upload URL for an already-created video.
 *
 * The client uploads the actual video file by sending an HTTP PUT request to
 * this URL with the raw file as the request body and the header
 * "AccessKey: <BUNNY_API_KEY>". Bunny then ingests, encodes and hosts it.
 *
 * NOTE: this is a pure string builder — no network call is made here — which
 * is why the function is not async.
 *
 * @param {string} videoId - The video's ID (the "guid" returned by createVideo).
 * @returns {string} The URL the client should PUT the video file to.
 */
function getUploadUrl(videoId) {
  const libraryId = bunnyEnv.libraryId;
  return `${BUNNY_API_BASE_URL}/library/${libraryId}/videos/${videoId}`;
}

/**
 * Generates a time-limited, token-signed playback URL for one video.
 *
 * How the signature works (this is Bunny's official Stream embed scheme):
 *   token = SHA256( signingKey + videoId + expirationUnixSeconds ) as hex
 *   url   = https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}
 *             ?token={token}&expires={expirationUnixSeconds}
 *
 * Bunny recomputes the same hash when someone opens the URL. If the hash
 * matches AND the expiration has not passed, playback is allowed. Anyone who
 * copies the link loses access as soon as it expires, and nobody can forge a
 * valid token without knowing BUNNY_SIGNING_KEY.
 *
 * @param {string} videoId - The video's ID (the "guid" from createVideo).
 * @param {number} [expiresInSeconds=DEFAULT_PLAYBACK_EXPIRY_SECONDS]
 *        How many seconds from now the URL should stay valid.
 * @returns {string} A ready-to-use signed playback URL (open it in a browser,
 *                   an <iframe>, or any HLS-capable player page).
 */
function generateSignedPlaybackUrl(
  videoId,
  expiresInSeconds = DEFAULT_PLAYBACK_EXPIRY_SECONDS
) {
  const libraryId = bunnyEnv.libraryId;
  const signingKey = bunnyEnv.signingKey;

  // Bunny expects a UNIX timestamp in SECONDS (not milliseconds), so we must
  // divide JavaScript's millisecond clock by 1000 and round down.
  const expirationUnixSeconds =
    Math.floor(Date.now() / 1000) + expiresInSeconds;

  // Concatenate exactly in Bunny's required order: key + videoId + expiration.
  const hashableBase = `${signingKey}${videoId}${expirationUnixSeconds}`;

  // SHA256 hex digest — lowercase hex characters only, so it is safe to put
  // straight into a URL query parameter without further encoding.
  const token = crypto
    .createHash("sha256")
    .update(hashableBase)
    .digest("hex");

  return (
    `${BUNNY_EMBED_BASE_URL}/${libraryId}/${videoId}` +
    `?token=${token}&expires=${expirationUnixSeconds}`
  );
}

/**
 * Fetches one video's full metadata from Bunny.
 *
 * Used to check encoding status after upload (Bunny processes videos
 * asynchronously — "created" does not mean "watchable yet").
 *
 * @param {string} videoId - The video's ID ("guid").
 * @returns {Promise<Object>} The video object. Useful fields:
 *            status (0=Created 1=Uploaded 2=Processing 3=Transcoding
 *                    4=Finished 5=Error 6=UploadFailed),
 *            encodeProgress (0-100), length (seconds), thumbnailCount.
 * @throws {Error} If the network call fails or Bunny replies with an error.
 */
async function getVideo(videoId) {
  const response = await fetch(
    `${BUNNY_API_BASE_URL}/library/${bunnyEnv.libraryId}/videos/${videoId}`,
    { headers: { AccessKey: bunnyEnv.apiKey } }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Bunny getVideo failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  return response.json();
}

/**
 * Finds the Bunny video that belongs to a lesson by TITLE CONVENTION.
 *
 * This project stores the lesson->video mapping ON BUNNY ITSELF instead of
 * a database: every video created through the platform is titled
 *     "{lessonId} | {human readable name}"
 * e.g. "lesson-1 | الدعامة في الكائنات الحية".
 * Videos uploaded manually through the Bunny dashboard work too, as long as
 * the title starts with the lesson ID followed by " " or "|".
 *
 * Matching is done by scanning the full library and comparing titles
 * locally — see findAllVideosByLessonId below for why Bunny's search
 * endpoint is no longer used.
 *
 * @param {string} lessonId - The lesson whose video we want, e.g. "lesson-1".
 * @returns {Promise<string|null>} The video ID ("guid"), or null when no
 *                                 video for this lesson exists yet.
 * @throws {Error} If the network call fails or Bunny replies with an error.
 */

/**
 * Finds ALL Bunny videos that belong to a lesson (a lesson can have several,
 * e.g. "شرح" + "مراجعة"), ordered oldest-first so parts stay in upload order.
 *
 * WHY THIS WAS REWRITTEN (the "videos disappeared" bug):
 * The lesson->video mapping lives ON BUNNY ITSELF inside the video title
 * ("lesson-N | name | ...") because there is no database yet. Lookup used to
 * rely on Bunny's "?search=lesson-N" query — but that endpoint is unreliable
 * for this purpose: its search matches loosely across fields, and combined
 * with itemsPerPage=100 + orderBy=date it only ever inspected the FIRST page
 * of results. Once the library grew (or the in-memory stub map was wiped by a
 * server restart / serverless cold start), yesterday's uploads fell outside
 * that first page and the platform reported them as missing even though they
 * were safe on Bunny.
 *
 * HOW IT WORKS NOW:
 *   1. Paginate through the ENTIRE library (100 per page, up to 50 pages)
 *      WITHOUT any search filter, so nothing can be missed.
 *   2. Filter locally: a title belongs to the lesson when it equals the
 *      lesson ID, or starts with "<lessonId> " / "<lessonId>|". Exact
 *      first-token matching means "lesson-1" never matches "lesson-10".
 *   3. Cache the result in memory for CACHE_TTL_MS (one process lifetime is
 *      still not durable storage — the real fix is the Prisma lessons table,
 *      see lesson.stub.service.js).
 *
 * @param {string} lessonId - e.g. "lesson-1".
 * @returns {Promise<Array<Object>>} Full Bunny video objects (may be empty).
 */

/** In-process cache for title scans: lessonId -> { at, items }. */
const _titleScanCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Fetches every video in the library, following pagination until done.
 * Stable ascending date order keeps each page's contents predictable while
 * we walk through all of them.
 */
async function listAllLibraryVideos() {
  const pageSize = 100;
  const maxPages = 50; // safety cap: 50 x 100 = 5000 videos
  const all = [];

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `${BUNNY_API_BASE_URL}/library/${bunnyEnv.libraryId}/videos` +
      `?page=${page}&itemsPerPage=${pageSize}&orderBy=date`;

    const response = await fetch(url, {
      headers: { AccessKey: bunnyEnv.apiKey },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Bunny listAllLibraryVideos failed (HTTP ${response.status}): ${errorBody}`
      );
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    all.push(...items);

    // Stop when the page came back short or we reached Bunny's declared total.
    const total = Number(data.totalItems);
    const reachedTotal = Number.isFinite(total) && total > 0 && all.length >= total;
    if (items.length < pageSize || reachedTotal) break;
  }

  return all;
}

async function findAllVideosByLessonId(lessonId) {
  // Serve repeated lookups from the short-lived cache when possible.
  const cached = _titleScanCache.get(lessonId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.items;
  }

  const libraryVideos = await listAllLibraryVideos();

  const matches = libraryVideos.filter((video) => {
    const title = typeof video.title === "string" ? video.title : "";
    return (
      title === lessonId ||
      title.startsWith(`${lessonId} `) ||
      title.startsWith(`${lessonId}|`)
    );
  });

  // Oldest first so "part 1" plays before "part 2".
  matches.sort((a, b) =>
    String(a.dateUploaded || "").localeCompare(String(b.dateUploaded || ""))
  );

  _titleScanCache.set(lessonId, { at: Date.now(), items: matches });

  return matches;
}

/**
 * Finds the NEWEST video belonging to a lesson.
 * Used where a single video is expected (legacy playback URL, upload polling).
 */
async function findVideoByLessonId(lessonId) {
  const matches = await findAllVideosByLessonId(lessonId);
  if (!matches.length) return null;

  const newest = matches[matches.length - 1];
  return newest.guid;
}

/**
 * Renames a Bunny video (this is how editing metadata works — the platform
 * stores name/attachment/description inside the title, see buildTitle).
 *
 * @param {string} videoId - The video's ID ("guid").
 * @param {string} title   - The new full title (already built by buildTitle).
 */
async function updateVideoTitle(videoId, title) {
  const response = await fetch(
    `${BUNNY_API_BASE_URL}/library/${bunnyEnv.libraryId}/videos/${videoId}`,
    {
      method: "POST",
      headers: {
        AccessKey: bunnyEnv.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Bunny updateVideoTitle failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  return true;
}

/**
 * Permanently deletes a video from the Bunny library.
 *
 * @param {string} videoId - The video's ID ("guid").
 */
async function deleteVideo(videoId) {
  const response = await fetch(
    `${BUNNY_API_BASE_URL}/library/${bunnyEnv.libraryId}/videos/${videoId}`,
    {
      method: "DELETE",
      headers: { AccessKey: bunnyEnv.apiKey },
    }
  );

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    throw new Error(
      `Bunny deleteVideo failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  return true;
}

/**
 * Parses a platform title back into its structured parts.
 * Inverse of buildTitle — see its docs for the exact format.
 *
 * @param {string} title - A full Bunny video title.
 * @returns {{lessonId: string, name: string, attachmentUrl: string, description: string}}
 */
function parseLessonTitle(title) {
  const segs = String(title || "").split(" | ");
  return {
    lessonId: segs[0] || "",
    name: segs[1] || "",
    attachmentUrl: segs[2] || "",
    description: segs.slice(3).join(" | "),
  };
}

/**
 * Builds the platform title from its structured parts.
 *
 * FORMAT: "lessonId | name [| attachmentUrl [| description]]"
 *   - "|" typed by the user is replaced with "/" (sanitized upstream).
 *   - Trailing empty segments are dropped; EMPTY MIDDLE segments are kept
 *     so each value always lands back in the same slot when parsed.
 *
 * @returns {string} The title to store on Bunny.
 */
function buildTitle(lessonId, name, attachmentUrl, description) {
  const segs = [
    lessonId,
    name || "شرح الدرس",
    attachmentUrl || "",
    description || "",
  ];
  while (segs.length > 2 && segs[segs.length - 1] === "") segs.pop();
  return segs.join(" | ");
}

module.exports = {
  createVideo,
  getUploadUrl,
  generateSignedPlaybackUrl,
  getVideo,
  findVideoByLessonId,
  findAllVideosByLessonId,
  listAllLibraryVideos,
  updateVideoTitle,
  deleteVideo,
  parseLessonTitle,
  buildTitle,
};
