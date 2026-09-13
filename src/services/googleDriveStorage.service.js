const fs = require("fs");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const { google } = require("googleapis");

function getUploadsDir() {
  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    (process.cwd() && process.cwd().startsWith("/var/task")),
  );

  let targetDir = isServerless
    ? path.join(os.tmpdir(), "uploads", "materials")
    : path.join(process.cwd(), "uploads", "materials");

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
  } catch (error) {
    console.warn(
      "[googleDriveStorage] Failed to create local uploads directory in primary path, using OS temp dir:",
      error.message,
    );
    const tmpDir = path.join(os.tmpdir(), "uploads", "materials");
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch (e) {
      console.error(
        "[googleDriveStorage] Could not create temp directory:",
        e.message,
      );
    }
    return tmpDir;
  }
}

const requiredEnvironmentVariables = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_OAUTH_REFRESH_TOKEN",
  "GOOGLE_DRIVE_FOLDER_ID",
];

function isDriveReauthorizationError(error) {
  const googleError = error?.response?.data?.error;
  return (
    googleError === "invalid_grant" ||
    error?.code === "invalid_grant" ||
    String(error?.message || "").includes("invalid_grant")
  );
}

function getDriveAuth() {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const redirectUri = (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    "http://localhost:53682/oauth2callback"
  ).trim();
  const refreshToken = (process.env.GOOGLE_OAUTH_REFRESH_TOKEN || "").trim();
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new Error("Google Drive configuration is incomplete.");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials({
    refresh_token: refreshToken,
  });
  return auth;
}

function getDriveClient() {
  const auth = getDriveAuth();
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

async function createPdfUploadSession(fileName, sizeBytes) {
  const auth = getDriveAuth();
  const response = await auth.request({
    url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/pdf",
      "X-Upload-Content-Length": String(sizeBytes),
    },
    data: JSON.stringify({
      name: safePdfName(fileName),
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID.trim()],
      mimeType: "application/pdf",
    }),
  });

  const uploadUrl =
    response.headers?.location || response.headers?.get?.("location");
  if (!uploadUrl) {
    throw new Error("Google Drive did not return a resumable upload URL.");
  }

  return { uploadUrl, fileName: safePdfName(fileName) };
}

async function getPdfMetadata(fileId) {
  const drive = getDriveClient();
  const result = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size,parents",
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
  const uploadsDir = getUploadsDir();
  const localPath = path.join(uploadsDir, `${fileId}.pdf`);

  if (String(fileId).startsWith("local_") || fs.existsSync(localPath)) {
    if (fs.existsSync(localPath)) {
      return fs.createReadStream(localPath);
    }
  }

  try {
    const drive = getDriveClient();
    const result = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" },
    );
    return result.data;
  } catch (error) {
    if (fs.existsSync(localPath)) {
      console.warn(
        "[googleDriveStorage] Google Drive stream failed, serving local fallback file:",
        error.message,
      );
      return fs.createReadStream(localPath);
    }
    throw error;
  }
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
    return {
      id: fileId,
      name: safePdfName(title),
      mimeType: "application/pdf",
    };
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
    const uploadsDir = getUploadsDir();
    const localPath = path.join(uploadsDir, `${fileId}.pdf`);
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
  createPdfUploadSession,
  getPdfMetadata,
  uploadQuizImage,
  getPdfStream,
  getImageStream,
  updatePdf,
  deletePdf,
  isDriveReauthorizationError,
};
