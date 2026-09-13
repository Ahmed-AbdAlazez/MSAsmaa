require("dotenv").config();
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { google } = require("googleapis");

const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
const redirectUriStr = (process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:53682/oauth2callback").trim();

if (!clientId || !clientSecret) {
  console.error("Missing Google Meet OAuth environment variables: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
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
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
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

    // Update GOOGLE_REFRESH_TOKEN specifically for Google Meet
    const envLineMeet = `GOOGLE_REFRESH_TOKEN=${newToken}`;
    currentEnv = /^(?:GOOGLE_REFRESH_TOKEN)=.*$/m.test(currentEnv)
      ? currentEnv.replace(/^(?:GOOGLE_REFRESH_TOKEN)=.*$/m, envLineMeet)
      : `${currentEnv}${currentEnv.endsWith("\n") || !currentEnv ? "" : "\n"}${envLineMeet}\n`;

    fs.writeFileSync(envPath, currentEnv, { encoding: "utf8", mode: 0o600 });
    console.log("Google Meet OAuth authorization succeeded!");
    console.log("The new refresh token was saved to GOOGLE_REFRESH_TOKEN in .env.");
  } catch (error) {
    console.error(
      "Google Meet OAuth authorization failed:", error.message
    );
    process.exitCode = 1;
  }
}

function startServer(port) {
  const currentRedirectUri = new URL(`http://localhost:${port}/oauth2callback`);
  const oauthClient = new google.auth.OAuth2(
    clientId,
    clientSecret,
    currentRedirectUri.toString(),
  );

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  });

  const server = http.createServer(async (request, response) => {
    const callbackUrl = new URL(request.url, currentRedirectUri.origin);
    if (callbackUrl.pathname !== currentRedirectUri.pathname) {
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
    server.close();
    if (error || !code) {
      console.error("OAuth authorization was denied or returned no code.");
      process.exitCode = 1;
      return;
    }
    try {
      const tokens = await oauthClient.getToken(String(code || "").trim());
      if (!tokens.tokens.refresh_token) {
        throw new Error("No refresh token was returned. Run again and approve consent.");
      }
      const envPath = path.resolve(process.cwd(), ".env");
      let currentEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
      const envLineMeet = `GOOGLE_REFRESH_TOKEN=${tokens.tokens.refresh_token}`;
      currentEnv = /^(?:GOOGLE_REFRESH_TOKEN)=.*$/m.test(currentEnv)
        ? currentEnv.replace(/^(?:GOOGLE_REFRESH_TOKEN)=.*$/m, envLineMeet)
        : `${currentEnv}${currentEnv.endsWith("\n") || !currentEnv ? "" : "\n"}${envLineMeet}\n`;
      fs.writeFileSync(envPath, currentEnv, { encoding: "utf8", mode: 0o600 });
      console.log("Google Meet OAuth authorization succeeded!");
      console.log("The new refresh token was saved to GOOGLE_REFRESH_TOKEN in .env.");
    } catch (err) {
      console.error("Google Meet OAuth authorization failed:", err.message);
      process.exitCode = 1;
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} is busy. Trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Could not start local OAuth callback server:", err.message);
      process.exitCode = 1;
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Open this URL in the browser with the Google account for GOOGLE MEET:`);
    console.log(authUrl);
    console.log(`Waiting for OAuth callback on port ${port}...`);
  });
}

const initialPort = Number(redirectUri.port || 53682);
startServer(initialPort);
