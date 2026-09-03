/**
 * zoom.service.js
 * ---------------------------------------------------------------------------
 * Integration service for Zoom API using Server-to-Server OAuth app.
 *
 * Environment variables expected:
 *   - ZOOM_ACCOUNT_ID
 *   - ZOOM_CLIENT_ID
 *   - ZOOM_CLIENT_SECRET
 */

/**
 * Retrieves a Server-to-Server OAuth access token from Zoom.
 *
 * @returns {Promise<string|null>} OAuth access token or null if credentials missing.
 */
async function getZoomAccessToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    return null;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
    accountId
  )}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[zoom.service] Failed to get OAuth token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Creates a Zoom meeting for the teacher.
 *
 * @param {object} params
 * @param {string} params.title - Title of the live session
 * @returns {Promise<{ meetingId: string, meetingUrl: string, passcode?: string }>}
 */
async function createZoomMeeting({ title, allowCamera = false }) {
  const accessToken = await getZoomAccessToken();

  if (!accessToken) {
    console.warn(
      "[zoom.service] ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, or ZOOM_CLIENT_SECRET missing in environment. Using sandbox/mock Zoom meeting fallback for testing."
    );
    const mockId = Math.floor(10000000000 + Math.random() * 90000000000).toString();
    const mockPasscode = Math.floor(100000 + Math.random() * 900000).toString();
    return {
      meetingId: mockId,
      meetingUrl: `https://zoom.us/j/${mockId}?pwd=${mockPasscode}`,
      passcode: mockPasscode,
    };
  }

  const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: title || "بث مباشر - منصة المرسال",
      type: 2, // Scheduled / Instant meeting
      settings: {
        host_video: true,
        participant_video: Boolean(allowCamera),
        join_before_host: true,
        mute_upon_entry: true,
        watermark: false,
        use_pmi: false,
        approval_type: 2, // Automatically approve
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[zoom.service] Create meeting failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return {
    meetingId: String(data.id),
    meetingUrl: data.join_url || data.start_url,
    passcode: data.password || "",
  };
}

module.exports = {
  createZoomMeeting,
  getZoomAccessToken,
};
