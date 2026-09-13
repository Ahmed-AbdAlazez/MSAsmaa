const path = require("path");
require("dotenv").config({
  path: "C:/Users/moham/OneDrive/Desktop/MSAsmaa/.env",
});

const {
  createPdfUploadSession,
  getPdfMetadata,
  deletePdf,
} = require("C:/Users/moham/OneDrive/Desktop/MSAsmaa/src/services/googleDriveStorage.service.js");

(async () => {
  // Dummy PDF bytes (~any binary works for the Drive upload; content doesn't matter here)
  const buffer = Buffer.alloc(5 * 1024 * 1024, 0x25); // 5MB > 4.5MB Vercel limit

  const session = await createPdfUploadSession("single-shot-test.pdf", buffer.length);
  console.log("1) session created -> fileId:", session.fileId);
  console.log("   uploadUrl (first 90 chars):", session.uploadUrl.slice(0, 90));

  // 2) CORS preflight simulation (what the browser would send before the PUT)
  try {
    const preflight = await fetch(session.uploadUrl, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    console.log("2) OPTIONS preflight status:", preflight.status);
    console.log(
      "   Access-Control-Allow-Origin:",
      preflight.headers.get("access-control-allow-origin"),
    );
    console.log(
      "   Access-Control-Allow-Headers:",
      preflight.headers.get("access-control-allow-headers"),
    );
  } catch (e) {
    console.log("2) OPTIONS preflight failed:", e.message);
  }

  // 3) Single whole-body PUT (no Content-Range, no chunking) -> full upload
  const put = await fetch(session.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: buffer,
    duplex: "half",
  });
  console.log("3) single PUT status:", put.status);
  const putBody = await put.text();
  console.log("   response body (first 200):", putBody.slice(0, 200));

  // 4) Verify via Drive metadata
  const fileId = session.fileId;
  const meta = await getPdfMetadata(fileId);
  console.log("4) metadata size:", meta.size, "name:", meta.name);

  // 5) Cleanup
  await deletePdf(fileId);
  console.log("5) cleaned up test file:", fileId);
})().catch((e) => {
  console.error("TEST FAILED:", e && e.message);
  process.exit(1);
});