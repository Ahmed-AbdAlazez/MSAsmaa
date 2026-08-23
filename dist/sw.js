/**
 * sw.js — MSAsmaa background upload worker
 * ---------------------------------------------------------------------------
 * Owns file uploads so they survive navigating between pages of the app.
 * Pages drop a job into IndexedDB and tell this worker to start it; the
 * worker performs the HTTP PUT itself and broadcasts progress to every open
 * tab through a BroadcastChannel. The upload keeps running as long as any
 * tab of the site is open — even though the page that started it is gone.
 */

const CHANNEL_NAME = "msasmaa-uploads";
const DB_NAME = "msasmaa-uploads";
const STORE_NAME = "jobs";

/* ---------------------------- IndexedDB ---------------------------------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    tx.oncomplete = () => resolve(req.result || null);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPut(job) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(job);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    tx.oncomplete = () => resolve(req.result || []);
    tx.onerror = () => reject(tx.error);
  });
}

/* --------------------------- Messaging ----------------------------------- */

function broadcast(message) {
  try {
    new BroadcastChannel(CHANNEL_NAME).postMessage(message);
  } catch (_) { /* channel unavailable — page UI just misses a tick */ }
}

/* ------------------------- Job execution --------------------------------- */

/** Jobs currently owned by this worker instance (guards double-starts). */
const runningJobs = new Set();

async function runJob(job) {
  if (!job || runningJobs.has(job.id)) return;
  if (job.status === "done") return;
  runningJobs.add(job.id);

  try {
    job.status = "uploading";
    await idbPut(job);
    broadcast({
      type: "started",
      jobId: job.id,
      label: (job.meta && job.meta.label) || "رفع ملف",
    });

    let response;

    // Stream the body through a counting transform so pages receive live
    // upload percentages. Requires request-streaming support; falls back to
    // a single-shot blob PUT (still backgrounded, progress jumps to 100).
    const supportsStreaming =
      typeof TransformStream !== "undefined" &&
      job.blob &&
      typeof job.blob.stream === "function";

    if (supportsStreaming) {
      const total = job.blob.size || 1;
      let sent = 0;
      let lastPct = -1;
      const counter = new TransformStream({
        transform(chunk, controller) {
          sent += chunk.byteLength || 0;
          const pct = Math.min(99, Math.round((sent * 100) / total));
          if (pct !== lastPct) {
            lastPct = pct;
            broadcast({ type: "progress", jobId: job.id, pct });
          }
          controller.enqueue(chunk);
        },
      });

      response = await fetch(job.url, {
        method: job.method || "PUT",
        headers: job.headers || {},
        body: job.blob.stream().pipeThrough(counter),
        duplex: "half",
      });
    } else {
      response = await fetch(job.url, {
        method: job.method || "PUT",
        headers: job.headers || {},
        body: job.blob,
      });
      broadcast({ type: "progress", jobId: job.id, pct: 100 });
    }

    if (!response.ok) {
      throw new Error(`فشل رفع الملف (${response.status}).`);
    }

    // Optional server-side step after the raw bytes landed (PDF finalize:
    // registers the material and runs normalization).
    if (job.finalize) {
      job.status = "finalizing";
      await idbPut(job);
      broadcast({ type: "progress", jobId: job.id, pct: 100, stage: "finalizing" });

      const finalizeResponse = await fetch(job.finalize.url, {
        method: job.finalize.method || "POST",
        headers: job.finalize.headers || {},
        body: job.finalize.body,
      });

      if (!finalizeResponse.ok) {
        const detail = await finalizeResponse.text().catch(() => "");
        throw new Error(
          `تعذر تسجيل الملف (${finalizeResponse.status}) ${detail.slice(0, 140)}`
        );
      }
    }

    await idbDelete(job.id);
    broadcast({
      type: "done",
      jobId: job.id,
      kind: job.kind,
      meta: job.meta,
    });
  } catch (error) {
    job.status = "failed";
    job.error = String((error && error.message) || error);
    try {
      await idbPut(job);
    } catch (_) { /* keep the failure notice even if persistence breaks */ }
    broadcast({ type: "failed", jobId: job.id, error: job.error });
  } finally {
    runningJobs.delete(job.id);
  }
}

/* --------------------------- Lifecycle ----------------------------------- */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "START_UPLOAD" && data.jobId) {
    event.waitUntil(
      (async () => {
        const job = await idbGet(data.jobId);
        if (job) await runJob(job);
      })()
    );
    return;
  }

  if (data.type === "GET_ACTIVE_JOBS") {
    event.waitUntil(
      (async () => {
        const jobs = await idbGetAll();
        const active = jobs.filter(
          (j) =>
            j.status === "queued" ||
            j.status === "uploading" ||
            j.status === "finalizing"
        );
        event.source.postMessage({
          type: "ACTIVE_JOBS",
          jobs: active.map((j) => ({
            id: j.id,
            status: j.status,
            label: j.meta && j.meta.label,
          })),
        });
      })()
    );
  }
});
