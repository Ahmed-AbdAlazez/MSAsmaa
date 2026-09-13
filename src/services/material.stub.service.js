const { prisma } = require("../config/db");
const { updatePdf, deletePdf } = require("./googleDriveStorage.service.js");

function toRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    lessonId: row.lessonId,
    title: row.title,
    fileId: row.driveFileId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    createdAt: row.createdAt,
    sizeBytes: row.sizeBytes,
  };
}

async function saveMaterialRecord(lessonId, title, driveFile) {
  const row = await prisma.lessonMaterial.create({
    data: {
      lessonId: String(lessonId),
      title: String(title || driveFile.name || "مادة الدرس").trim(),
      driveFileId: driveFile.id,
      fileName: driveFile.name || "lesson-material.pdf",
      mimeType: driveFile.mimeType || "application/pdf",
      sizeBytes: driveFile.size ? BigInt(driveFile.size) : null,
    },
  });
  return toRecord(row);
}

async function getMaterialsForLesson(lessonId) {
  const rows = await prisma.lessonMaterial.findMany({
    where: { lessonId: String(lessonId) },
    orderBy: { createdAt: "desc" },
    // Both consumers (student list + teacher manage list) only render these
    // columns; streaming full rows just for id/title wastes Neon->Vercel.
    select: { id: true, lessonId: true, title: true, createdAt: true, sizeBytes: true },
  });
  return rows.map(toRecord);
}

async function getMaterialById(materialId) {
  const row = await prisma.lessonMaterial.findUnique({
    where: { id: String(materialId) },
  });
  return toRecord(row);
}

async function getMaterialByDriveFileId(driveFileId) {
  const row = await prisma.lessonMaterial.findUnique({
    where: { driveFileId: String(driveFileId) },
  });
  return toRecord(row);
}

async function updateMaterialTitle(materialId, newTitle, knownDriveFileId) {
  const driveFileId = knownDriveFileId || (await getMaterialDriveFileId(materialId));
  if (!driveFileId) return null;

  const driveFile = await updatePdf(driveFileId, newTitle);
  const row = await prisma.lessonMaterial.update({
    where: { id: String(materialId) },
    data: {
      title: String(newTitle).trim(),
      fileName: driveFile.name || "lesson-material.pdf",
    },
  });
  return toRecord(row);
}

async function deleteMaterial(materialId, knownDriveFileId) {
  const driveFileId = knownDriveFileId || (await getMaterialDriveFileId(materialId));
  if (!driveFileId) return false;
  await deletePdf(driveFileId);
  await prisma.lessonMaterial.delete({ where: { id: String(materialId) } });
  return true;
}

/**
 * Resolves a material's Drive file id, or null when the row does not exist.
 * Routes that already fetched the material (PATCH/DELETE need its
 * driveFileId for ownership checks) pass it in to dodge a second read.
 */
async function getMaterialDriveFileId(materialId) {
  const row = await prisma.lessonMaterial.findUnique({
    where: { id: String(materialId) },
    select: { driveFileId: true },
  });
  return row ? row.driveFileId : null;
}

// Lesson ownership is still a single-teacher platform, matching video management.
async function isTeacherOwnerOfLesson() {
  return true;
}

module.exports = {
  saveMaterialRecord,
  getMaterialsForLesson,
  getMaterialById,
  getMaterialByDriveFileId,
  updateMaterialTitle,
  deleteMaterial,
  isTeacherOwnerOfLesson,
};
