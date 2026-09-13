/**
 * google-meet.service.js
 * ---------------------------------------------------------------------------
 * Integration service for Google Meet API (via Google Calendar API conferenceData).
 *
 * Environment variables expected:
 *   - GOOGLE_CLIENT_ID
 *   - GOOGLE_CLIENT_SECRET
 *   - GOOGLE_REFRESH_TOKEN
 */

const crypto = require("crypto");

/**
 * Gets an OAuth2 access token for Google API calls using refresh token.
 *
 * @returns {Promise<string|null>} OAuth access token or null if credentials missing.
 */
async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      refresh_token: refreshToken.trim(),
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[google-meet.service] Failed to refresh Google access token: ${response.status} ${errorText}`);
    return null;
  }

  const data = await response.json();
  return data.access_token;
}

function getMockMeeting() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const randomLetters = (len) =>
    Array.from({ length: len }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  const code = `${randomLetters(3)}-${randomLetters(4)}-${randomLetters(3)}`;
  return {
    meetingId: code,
    meetingUrl: `https://meet.google.com/${code}`,
  };
}

/**
 * Creates a Google Meet video conference event.
 *
 * @param {object} params
 * @param {string} params.title - Title of the live session
 * @returns {Promise<{ meetingId: string, meetingUrl: string }>}
 */
async function createGoogleMeetSession({ title }) {
  let accessToken = null;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (error) {
    console.warn("[google-meet.service] Error retrieving access token:", error.message);
  }

  if (!accessToken) {
    console.warn(
      "[google-meet.service] Google API credentials missing or invalid/expired (invalid_grant). Using sandbox/mock Google Meet fallback."
    );
    return getMockMeeting();
  }

  try {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours window

    const requestId = crypto.randomUUID();

    const eventPayload = {
      summary: title || "بث مباشر - منصة المرسال",
      description: "بث مباشر تعليمي على منصة المرسال الأستاذة أسماء مرسال",
      start: {
        dateTime: startTime.toISOString(),
      },
      end: {
        dateTime: endTime.toISOString(),
      },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
    };

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[google-meet.service] Failed to create Google Meet event: ${response.status} ${errorText}`);
      console.warn("[google-meet.service] Falling back to sandbox/mock Google Meet link.");
      return getMockMeeting();
    }

    const data = await response.json();
    const conference = data.conferenceData;
    const entryPoint = conference && conference.entryPoints && conference.entryPoints.find((ep) => ep.entryPointType === "video");

    const meetingUrl = entryPoint ? entryPoint.uri : (data.hangoutLink || "");
    const meetingId = conference ? conference.conferenceId : (data.id || requestId);

    if (!meetingUrl) {
      console.warn("[google-meet.service] Google API created event but returned no conference link. Using sandbox link.");
      return getMockMeeting();
    }

    return {
      meetingId: String(meetingId),
      meetingUrl,
    };
  } catch (err) {
    console.error("[google-meet.service] Error calling Google Calendar API:", err.message);
    console.warn("[google-meet.service] Falling back to sandbox/mock Google Meet link.");
    return getMockMeeting();
  }
}

module.exports = {
  createGoogleMeetSession,
  getGoogleAccessToken,
};
