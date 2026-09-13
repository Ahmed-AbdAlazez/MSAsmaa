const path = require("path");
const { Readable } = require("stream");
const { google } = require("googleapis");

const requiredEnvironmentVariables = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_OAUTH_REFRESH_TOKEN",
  "GOOGLE_DRIVE_FOLDER_ID",
];

function getDriveClient() {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = (process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/oauth2callback").trim();
  const refreshToken = (process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN || "").trim();
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new Error("Google Drive configuration is incomplete.");
  }

  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );
  auth.setCredentials({
    refresh_token: refreshToken,
  });
  return google.drive({ version: "v3", auth });
}

function safePdfName(fileName) {
  const parsed = path.parse(String(fileName || "lesson-material.pdf"));
  const base = parsed.name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${base || "lesson-material"}.pdf`;
}

function safeImageName(fileName, mimeType) {
  const extensionByMimeType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  const extension = extensionByMimeType[mimeType] || ".img";
  const parsed = path.parse(String(fileName || "question-image"));
  const base = parsed.name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${base || "question-image"}-${Date.now()}${extension}`;
}

async function uploadPdf(buffer, fileName) {
  const drive = getDriveClient();
  const result = await drive.files.create({
    requestBody: {
      name: safePdfName(fileName),
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID.trim()],
      mimeType: "application/pdf",
    },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id,name,mimeType,size,createdTime,modifiedTime",
    supportsAllDrives: true,
  });
  return result.data;
}

async function uploadQuizImage(buffer, fileName, mimeType) {
  const drive = getDriveClient();
  const result = await drive.files.create({
    requestBody: {
      name: safeImageName(fileName, mimeType),
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID.trim()],
      mimeType,
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id,name,mimeType,size,createdTime,modifiedTime",
    supportsAllDrives: true,
  });
  return result.data;
}

async function getPdfStream(fileId) {
  const drive = getDriveClient();
  const result = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  return result.data;
}

async function getImageStream(fileId) {
  const drive = getDriveClient();
  const result = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  return result;
}

async function updatePdf(fileId, title) {
  const drive = getDriveClient();
  const result = await drive.files.update({
    fileId,
    requestBody: { name: safePdfName(title) },
    fields: "id,name,mimeType,size,createdTime,modifiedTime",
    supportsAllDrives: true,
  });
  return result.data;
}

async function deletePdf(fileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

module.exports = {
  uploadPdf,
  uploadQuizImage,
  getPdfStream,
  getImageStream,
  updatePdf,
  deletePdf,
};
