/**
 * liveSession.service.js
 * ===========================================================================
 * Source of truth for "is a live session running right now?".
 *
 * This mirrors the project's stub-based persistence pattern (see
 * lesson.stub.service.js): state lives in an in-memory registry keyed by a
 * deterministic room name. There is intentionally NO schema.prisma edit here —
 * the single room name is fixed, so even after a server restart the room name
 * is stable and everyone (teacher + students) resolves the same room.
 *
 * KNOWN LIMITATION (flagging, not blocking):
 *   Because this registry is in-memory, a serverless cold start mid-session
 *   would forget the in-memory "live flag". The room itself still exists on
 *   Daily (it lives for ~5h), so the durable fix is a `LiveSession` Prisma
 *   table storing { roomName, startedBy, startedAt, endedAt }. That is a
 *   schema.prisma change and is intentionally NOT made here — see the
 *   "SETUP NEEDED FROM ME" / follow-up notes in the summary.
 * ===========================================================================
 */

// Single active live session. Null when nothing is live.
const _state = {
  roomName: null,
  startedBy: null,
  title: null,
  startedAt: null,
};

/**
 * Marks a live session as started.
 *
 * @param {object} opts
 * @param {string} opts.roomName
 * @param {string} opts.startedBy    teacher user id
 * @param {string} [opts.title]
 */
function startLiveSession({ roomName, startedBy, title }) {
  _state.roomName = roomName;
  _state.startedBy = startedBy;
  _state.title = title || "";
  _state.startedAt = new Date().toISOString();
}

/**
 * Returns a snapshot of the live session state (or null when idle).
 */
function getLiveSession() {
  if (!_state.roomName) return null;
  return {
    roomName: _state.roomName,
    startedBy: _state.startedBy,
    title: _state.title,
    startedAt: _state.startedAt,
  };
}

/**
 * Clears the live session registry (session ended).
 */
function endLiveSession() {
  const snapshot = getLiveSession();
  _state.roomName = null;
  _state.startedBy = null;
  _state.title = null;
  _state.startedAt = null;
  return snapshot;
}

module.exports = {
  startLiveSession,
  getLiveSession,
  endLiveSession,
};
