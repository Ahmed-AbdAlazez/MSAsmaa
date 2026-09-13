const fs = require("fs");

const BASE = "http://localhost:3199";

async function jsonFetch(url, options = {}) {
  const res = await fetch(BASE + url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { status: res.status, data };
}

(async () => {
  // 1) login as teacher
  const login = await jsonFetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentCode: "T", password: process.env.TEACHER_PASSWORD || "Asmaa@2026" }),
  });
  console.log("1) login status:", login.status);
  const token =
    login.data?.token ||
    login.data?.data?.token ||
    login.data?.data?.accessToken ||
    (login.data?.data && login.data.data.token);
  if (!token) {
    console.log("   login body:", JSON.stringify(login.data).slice(0, 300));
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${token}` };
  console.log("   token obtained:", token.slice(0, 20) + "...");

  // Build a real PDF bigger than 4.2MB (text-heavy so it is a plausibly valid PDF)
  const pdfPages = [];
  for (let p = 0; p < 40; p++) {
    pdfPages.push(
      "BT /F1 24 Tf 72 720 Td (Page " + p + " - Lorem ipsum dolor sit amet consectetur adipiscing elit) Tj ET",
    );
  }
  const pdfBody = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj",
    "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "5 0 obj<</Length " + (pdfBody ? "" : "") + Buffer.byteLength(pdfPages.join("\n")) + ">>stream",
    pdfPages.join("\n"),
    "endstream",
    "endobj",
    "xref",
    "0000000000 65535 f ",
    "trailer<</Size 6/Root 1 0 R>>",
    "startxref",
    "0",
    "%%EOF",
  ].join("\n");
  const smallBuffer = Buffer.from(pdfBody, "utf8");
  // pad to > 4.2MB (4.4MB) with a trailing comment so Drive sees a real size
  const padNeed = 4.4 * 1024 * 1024 - smallBuffer.length;
  const bigBuffer = Buffer.concat([smallBuffer, Buffer.alloc(Math.max(0, padNeed), 0x0a)]);
  console.log("   test file size:", bigBuffer.length, "bytes");

  // 2) create upload session
  const session = await jsonFetch("/api/lessons/lesson-1/materials/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({
      fileName: "e2e-large-upload.pdf",
      mimeType: "application/pdf",
      sizeBytes: bigBuffer.length,
      title: "E2E Large Upload Test",
    }),
  });
  console.log("2) upload-session status:", session.status);
  if (session.status !== 200 || !session.data.uploadUrl) {
    console.log("   body:", JSON.stringify(session.data).slice(0, 500));
    process.exit(1);
  }
  const { uploadUrl, uploadToken, fileId } = session.data;
  console.log("   uploadUrl:...", uploadUrl.slice(0, 70), "fileId:", fileId);

  // 3) single whole-body PUT directly to Drive (no chunks) — exactly what the new frontend does
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: bigBuffer,
    duplex: "half",
  });
  console.log("3) single-PUT status:", put.status);
  const putBody = await put.text();
  console.log("   drive response id:", (JSON.parse(putBody) || {}).id || "(none)");

  // 4) complete-upload (records the material in the DB)
  const complete = await jsonFetch("/api/lessons/lesson-1/materials/complete-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ fileId, uploadToken }),
  });
  console.log("4) complete-upload status:", complete.status, JSON.stringify(complete.data).slice(0, 200));

  // 5) verify it shows up in the manage list
  const manage = await jsonFetch("/api/lessons/lesson-1/materials/manage", { headers: auth });
  const found = (manage.data?.materials || []).filter((m) => m.title === "E2E Large Upload Test");
  console.log("5) manage list hit:", found.length > 0, "- sizeBytes:", found[0]?.sizeBytes);

  // 6) cleanup
  if (found[0]) {
    const del = await jsonFetch(`/api/materials/${encodeURIComponent(found[0].id)}`, {
      method: "DELETE",
      headers: auth,
    });
    console.log("6) cleanup status:", del.status);
  }
})().catch((e) => {
  console.error("E2E FAILED:", e && e.message);
  process.exit(1);
});