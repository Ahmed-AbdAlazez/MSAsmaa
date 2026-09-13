require("dotenv").config();
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { google } = require("googleapis");

const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
const redirectUriStr = (process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:53682/oauth2callback").trim();

if (!clientId || !clientSecret) {
  console.error("Missing Google Drive OAuth environment variables: GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUriStr,
);
const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/drive",
  ],
});

async function saveRefreshToken(code) {
  try {
    const tokens = await oauth2Client.getToken(String(code || "").trim());
    if (!tokens.tokens.refresh_token) {
      throw new Error(
        "No refresh token was returned. Run again and approve consent.",
      );
    }
    const envPath = path.resolve(process.cwd(), ".env");
    let currentEnv = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf8")
      : "";
    
    const newToken = tokens.tokens.refresh_token;

    // Update GOOGLE_OAUTH_REFRESH_TOKEN for Google Drive
    const envLineDrive = `GOOGLE_OAUTH_REFRESH_TOKEN=${newToken}`;
    currentEnv = /^(?:GOOGLE_OAUTH_REFRESH_TOKEN)=.*$/m.test(currentEnv)
      ? currentEnv.replace(/^(?:GOOGLE_OAUTH_REFRESH_TOKEN)=.*$/m, envLineDrive)
      : `${currentEnv}${currentEnv.endsWith("\n") || !currentEnv ? "" : "\n"}${envLineDrive}\n`;

    fs.writeFileSync(envPath, currentEnv, { encoding: "utf8", mode: 0o600 });
    console.log("Google Drive OAuth authorization succeeded.");
    console.log("The refresh token was saved to GOOGLE_OAUTH_REFRESH_TOKEN in .env.");
  } catch (error) {
    console.error(
      "Google Drive OAuth authorization failed:", error.message
    );
    process.exitCode = 1;
  }
}

const redirectUri = new URL(redirectUriStr);
if (
  redirectUri.hostname !== "localhost" &&
  redirectUri.hostname !== "127.0.0.1"
) {
  console.error(
    "GOOGLE_OAUTH_REDIRECT_URI must use localhost for this local one-time helper.",
  );
  process.exit(1);
}

const callbackServer = http.createServer(async (request, response) => {
  const callbackUrl = new URL(request.url, redirectUri.origin);
  if (callbackUrl.pathname !== redirectUri.pathname) {
    response.writeHead(404).end();
    return;
  }
  const error = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(
    error
      ? "Authorization was denied. You may close this window."
      : "Authorization received. You may close this window.",
  );
  callbackServer.close();
  if (error || !code) {
    console.error("OAuth authorization was denied or returned no code.");
    process.exitCode = 1;
    return;
  }
  await saveRefreshToken(code);
});

callbackServer.on("error", () => {
  console.error(
    "Could not start the local OAuth callback. Check the redirect URI port.",
  );
  process.exitCode = 1;
});
callbackServer.listen(
  Number(redirectUri.port || 80),
  redirectUri.hostname,
  () => {
    console.log(
      "Open this URL in the Gmail browser account that owns the existing Drive folder:",
    );
    console.log(authorizationUrl);
    console.log(
      "Waiting for the OAuth callback at the configured localhost redirect URI.",
    );
  },
);
