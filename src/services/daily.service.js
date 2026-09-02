/**
 * daily.service.js
 * ---------------------------------------------------------------------------
 * The ONLY file in this project that talks directly to the Daily.co API.
 *
 * It exposes three operations used by the live-stream routes:
 *   createRoomAndToken      - create a room (if needed) + mint an owner token
 *   createParticipantToken  - mint a token for a student/teacher joining
 *   deleteRoom              - tear the room down when the session ends
 *
 * STUB / DEV MODE
 * ---------------------------------------------------------------------------
 * If DAILY_API_KEY is not set (see src/config/daily.env.config.js), these
 * functions do NOT hit the network. Instead they return simulated, clearly
 * marked values so the whole feature (routes, UI, notifications, tests) can
 * be developed before the real key exists. Once the key is added, the exact
 * same code paths call the real Daily REST API — nothing else changes.
 *
 * SECURITY RULES:
 *   - All secrets come from process.env via daily.env.config.js.
 *   - The API key is a server-side secret and is NEVER returned to the client.
 *   - Meeting tokens are minted server-side only; the client receives the
 *     token (needed to join) but never the API key.
 *
 * Requires Node.js >= 18 (global fetch).
 * ---------------------------------------------------------------------------
 */

if (typeof fetch !== "function") {
  throw new Error(
    "global fetch() is not available. Daily integration requires Node.js 18+."
  );
}

const dailyEnv = require("../config/daily.env.config.js");

const DAILY_API_BASE = "https://api.daily.co/v1";

// How long a room and a meeting token stay valid (seconds).
const SESSION_LIFETIME_SECONDS = 5 * 60 * 60; // 5 hours
const TOKEN_EXPIRY_SECONDS = 30 * 60; // 30 minutes

/**
 * Builds the embeddable room URL for a given room name.
 * In stub mode we fabricate a URL that obviously is not a live call, so any
 * test/tester immediately knows the real Daily key still needs configuring.
 */
function roomUrlForName(roomName) {
  if (!dailyEnv.isConfigured) {
    return `https://${dailyEnv.domain || "stub"}/stub/${roomName}?stub=1&needs_daily_api_key=1`;
  }
  return `https://${dailyEnv.domain}/${roomName}`;
}

/** HTTP headers shared by every Daily management-API call. */
function authHeaders() {
  return {
    Authorization: `Bearer ${dailyEnv.apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Creates a Daily room. If it already exists (e.g. a previous attempt that was
 * never torn down), Daily returns 409; we treat that as success and reuse it.
 *
 * @param {string} roomName
 * @param {{title?:string, start_video_off?:boolean, start_audio_off?:boolean}} [opts]
 * @returns {Promise<{url:string, name:string, created:boolean}>}
 */
async function createRoom(roomName, opts = {}) {
  const url = roomUrlForName(roomName);
  if (!dailyEnv.isConfigured) {
    return { url, name: roomName, created: true };
  }

  const body = {
    name: roomName,
    privacy: "private", // only holders of a meeting token can join
    properties: {
      exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
      lang: "ar",
      // Students joining this room start with camera OFF and mic OFF by
      // default (lecture-style), togglable by the owner (teacher).
      start_video_off: opts.start_video_off ?? false,
      start_audio_off: opts.start_audio_off ?? true,
      // Prefer the (upcoming) Arabic support automatically; benign otherwise.
    },
  };

  const response = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    // Room already exists => reuse it.
    return { url, name: roomName, created: false };
  }
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Daily createRoom failed (HTTP ${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return { url: data.url || url, name: data.name || roomName, created: true };
}

/**
 * Mints a Daily meeting token for a participant.
 *
 * @param {string} roomName
 * @param {object} opts
 * @param {string}  opts.userName    Display name (student name / "المعلمة").
 * @param {boolean} opts.isOwner     Teacher = meeting owner (can mute others, end).
 * @param {boolean} opts.audioOff    Start with microphone muted.
 * @param {boolean} opts.videoOff    Start with camera disabled.
 * @param {boolean} opts.canSendAudio  Whether the participant may send audio.
 * @param {boolean} opts.canSendVideo  Whether the participant may send video.
 * @returns {Promise<string>} The meeting token.
 */
async function createMeetingToken(roomName, {
  userName,
  isOwner = false,
  audioOff = true,
  videoOff = true,
  canSendAudio = true,
  canSendVideo = true,
} = {}) {
  if (!dailyEnv.isConfigured) {
    // Deterministic stub token so routes/tests can pass it around shape-wise.
    return `stub-token-${roomName}-${isOwner ? "owner" : "participant"}`;
  }

  const properties = {
    room_name: roomName,
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
    is_owner: isOwner,
    start_audio_off: audioOff,
    start_video_off: videoOff,
    user_name: String(userName || (isOwner ? "المعلمة" : "طالبة")).slice(0, 80),
  };

  if (!isOwner) {
    // Lecture-style defaults: a student may only RECEIVE by default unless we
    // opt them into sending. Here we allow sending the media but the session
    // has them muted at start; the teacher can unmute specific participants.
    // (Permissions: allow audio/video tracks but they start OFF.)
    properties.permissions = {
      canSend: canSendAudio || canSendVideo ? ["audio", "video"] : false,
      canAdmin: [],
    };
  }

  const response = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Daily createMeetingToken failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.token;
}

/**
 * Deletes a Daily room (idempotent — 404 is treated as success).
 *
 * @param {string} roomName
 */
async function deleteRoom(roomName) {
  if (!dailyEnv.isConfigured) {
    return true;
  }
  const response = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    throw new Error(`Daily deleteRoom failed (HTTP ${response.status}): ${errorBody}`);
  }
  return true;
}

module.exports = {
  createRoom,
  createMeetingToken,
  deleteRoom,
  roomUrlForName,
  DAILY_API_BASE,
};
