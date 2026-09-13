require("dotenv").config();
const readline = require("readline");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
const redirectUri = (process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:53682/oauth2callback").trim();

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events"
  ],
});

console.log("\n=======================================================");
console.log("📌 MANUAL GOOGLE MEET REFRESH TOKEN GENERATOR");
console.log("=======================================================");
console.log("1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Log in with your Google Meet account and click Allow.");
console.log("3. After logging in, copy the 'code' parameter value from the browser address bar (e.g., 4/0A...).");
console.log("=======================================================\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste the code parameter here: ", async (code) => {
  rl.close();
  const rawCode = String(code || "").trim();
  if (!rawCode) {
    console.error("❌ No code entered.");
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(rawCode);
    if (!tokens.refresh_token) {
      console.error("❌ No refresh token returned. Make sure to click Allow.");
      return;
    }
    const envPath = path.resolve(process.cwd(), ".env");
    let currentEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const envLineMeet = `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
    currentEnv = /^(?:GOOGLE_REFRESH_TOKEN)=.*$/m.test(currentEnv)
      ? currentEnv.replace(/^(?:GOOGLE_REFRESH_TOKEN)=.*$/m, envLineMeet)
      : `${currentEnv}${currentEnv.endsWith("\n") || !currentEnv ? "" : "\n"}${envLineMeet}\n`;
    fs.writeFileSync(envPath, currentEnv, { encoding: "utf8", mode: 0o600 });
    console.log("\n✅ SUCCESS! New GOOGLE_REFRESH_TOKEN saved to .env file!");
  } catch (err) {
    console.error("\n❌ Token exchange failed:", err.message);
  }
});
