const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { google } = require("googleapis");

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "uploads", "materials");
if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
}

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
  try {
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
  } catch (error) {
    console.warn("[googleDriveStorage] Google Drive upload failed or unconfigured:", error.message);
    console.warn("[googleDriveStorage] Saving PDF locally in uploads/materials as immediate fallback.");
    const fileId = `local_${crypto.randomUUID()}`;
    const localPath = path.join(LOCAL_UPLOADS_DIR, `${fileId}.pdf`);
    fs.writeFileSync(localPath, buffer);
    return {
      id: fileId,
      name: safePdfName(fileName),
      mimeType: "application/pdf",
      size: buffer.length,
    };
  }
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
  if (String(fileId).startsWith("local_")) {
    const localPath = path.join(LOCAL_UPLOADS_DIR, `${fileId}.pdf`);
    if (!fs.existsSync(localPath)) {
      throw new Error("Local PDF material file not found.");
    }
    return fs.createReadStream(localPath);
  }
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
  if (String(fileId).startsWith("local_")) {
    return { id: fileId, name: safePdfName(title), mimeType: "application/pdf" };
  }
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
  if (String(fileId).startsWith("local_")) {
    const localPath = path.join(LOCAL_UPLOADS_DIR, `${fileId}.pdf`);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    return;
  }
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
