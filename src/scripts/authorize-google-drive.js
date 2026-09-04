require("dotenv").config();
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { google } = require("googleapis");

const required = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
];
const missing = required.filter(
  (name) => !String(process.env[name] || "").trim(),
);
if (missing.length) {
  console.error("Missing OAuth environment variable(s): " + missing.join(", "));
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID.trim(),
  process.env.GOOGLE_OAUTH_CLIENT_SECRET.trim(),
  process.env.GOOGLE_OAUTH_REDIRECT_URI.trim(),
);
const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/drive"],
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
    const currentEnv = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf8")
      : "";
    const envLine = `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.tokens.refresh_token}`;
    const updatedEnv = /^(?:GOOGLE_OAUTH_REFRESH_TOKEN)=.*$/m.test(currentEnv)
      ? currentEnv.replace(/^(?:GOOGLE_OAUTH_REFRESH_TOKEN)=.*$/m, envLine)
      : `${currentEnv}${currentEnv.endsWith("\n") || !currentEnv ? "" : "\n"}${envLine}\n`;
    fs.writeFileSync(envPath, updatedEnv, { encoding: "utf8", mode: 0o600 });
    console.log("OAuth authorization succeeded.");
    console.log("The refresh token was saved to the local .env file.");
  } catch (error) {
    console.error(
      "OAuth authorization failed. Check the redirect URI and authorization code.",
    );
    process.exitCode = 1;
  }
}

const redirectUri = new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI.trim());
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
