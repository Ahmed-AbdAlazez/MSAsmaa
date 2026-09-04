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
  });
  return rows.map(toRecord);
}

async function getMaterialById(materialId) {
  const row = await prisma.lessonMaterial.findUnique({
    where: { id: String(materialId) },
  });
  return toRecord(row);
}

async function updateMaterialTitle(materialId, newTitle) {
  const current = await prisma.lessonMaterial.findUnique({
    where: { id: String(materialId) },
  });
  if (!current) return null;

  const driveFile = await updatePdf(current.driveFileId, newTitle);
  const row = await prisma.lessonMaterial.update({
    where: { id: current.id },
    data: {
      title: String(newTitle).trim(),
      fileName: driveFile.name || current.fileName,
    },
  });
  return toRecord(row);
}

async function deleteMaterial(materialId) {
  const current = await prisma.lessonMaterial.findUnique({
    where: { id: String(materialId) },
  });
  if (!current) return false;
  await deletePdf(current.driveFileId);
  await prisma.lessonMaterial.delete({ where: { id: current.id } });
  return true;
}

// Lesson ownership is still a single-teacher platform, matching video management.
async function isTeacherOwnerOfLesson() {
  return true;
}

module.exports = {
  saveMaterialRecord,
  getMaterialsForLesson,
  getMaterialById,
  updateMaterialTitle,
  deleteMaterial,
  isTeacherOwnerOfLesson,
};
