# Video Upload & Playback Integration (Bunny.net Stream)

Isolated backend integration for uploading lesson videos to [Bunny Stream](https://bunny.net/stream/) and serving them to enrolled students through short-lived signed URLs.

- **No DRM / watermarking add-on** — access control is token-authenticated signed URLs only.
- **Fully isolated** — everything lives in new files under `src/`. Nothing existing was modified.
- **Written in CommonJS** (`require`/`module.exports`). If your backend uses `"type": "module"` (ESM), convert the imports to `import ... from` form — nothing else changes.

---

## 1. How the whole flow works, end to end

### Upload flow (teacher posts a lesson video)

```
Teacher's browser                    Your Express server                 Bunny.net
       |                                     |                               |
       | 1. POST /api/lessons/:id/video      |                               |
       |------------------------------------>|                               |
       |    (requireAuth proves identity;    | 2. createVideo(title)         |
       |     route checks role == teacher)   |------------------------------>|
       |                                     |<-- video guid (Bunny's ID) ---|
       |                                     |                               |
       |                                     | 3. saveLessonVideoId(         |
       |                                     |      lessonId, guid)          |
       |<-- { videoId, uploadUrl } ----------|   (stub in-memory for now)    |
       |                                                                     |
       | 4. HTTP PUT the raw file bytes ----> (directly to Bunny, not        |
       |    to uploadUrl, with header          through your server)          |
       |    "AccessKey: <BUNNY_API_KEY>" ---------------------------------->|
       |<-- 201: Bunny ingests + encodes the video -------------------------|
```

Key idea: your server never touches the big file. It only *reserves* a slot on Bunny (step 2–3), then hands back an upload URL so the teacher's browser uploads **directly** to Bunny (step 4). Bunny then encodes and hosts the video.

### Playback flow (student watches a lesson)

```
Student's browser                    Your Express server                 Bunny.net
       |                                     |
       | 1. GET /api/lessons/:id/video-url   |
       |------------------------------------>|
       |                                     | 2. MAIN ACCESS CONTROL POINT:
       |                                     |    isStudentEnrolledInLessonCourse(
       |                                     |         req.user.id, lessonId)
       |                                     |    false --> 403 Forbidden (STOP)
       |                                     |
       |                                     | 3. getLessonVideoId(lessonId)
       |                                     |    null  --> 404 Not Found
       |                                     |
       |                                     | 4. generateSignedPlaybackUrl(videoId)
       |<-- { playbackUrl, expires... } -----|
       |                                     |
       | 5. Open playbackUrl in an <iframe> or player page. Bunny checks the
       |    token + expiry on every request. After it expires, the link dies
       |    and step 1 must be repeated.
```

The signed URL is built as Bunny's official Stream embed scheme:

```
token = SHA256_HEX( BUNNY_SIGNING_KEY + videoId + expiresUnixSeconds )
url   = https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}?token={token}&expires={expires}
```

Nobody can forge a valid token without the signing key, and every URL self-destructs after 3 hours — so copied links stop working.

---

## 2. Environment variables

The integration needs the [dotenv](https://www.npmjs.com/package/dotenv) package:

```powershell
npm install dotenv
```

Set these before starting the server — in a `.env` file in the folder you run the server from, or in your host's environment settings:

```env
BUNNY_API_KEY=your-api-key-here
BUNNY_LIBRARY_ID=123456
BUNNY_SIGNING_KEY=your-signing-key-here
```

| Variable | Required | Where to get it from the Bunny.net dashboard |
|---|---|---|
| `BUNNY_API_KEY` | Yes | bunny.net dashboard → **Account Settings → API Keys** ("Stream API Key", or your main account API key). Treat it like a password. |
| `BUNNY_LIBRARY_ID` | Yes | Dashboard → **Stream → (your video library)**. The numeric ID is shown under the library name / in the URL when viewing the library. |
| `BUNNY_SIGNING_KEY` | Yes | Dashboard → **Stream → (your library) → Security (Token Authentication)**. Enable token authentication and copy the **Signing Key / URL Token Auth Key** shown there. |

Notes:
- Values are read **only** from `process.env` (which dotenv fills from `.env`) — never hardcoded anywhere.
- Validation runs at **server startup**: `src/config/bunny.env.config.js` checks all three variables and, if any is missing or blank, crashes immediately with an error listing *every* missing variable and where to find it. No half-configured server can start.
- `dotenv.config()` does not overwrite variables already set in the real environment (e.g. by your hosting provider), so it is safe even if your `server.js` also calls dotenv itself.
- Add `.env` to `.gitignore` so keys never get committed.
- Requires **Node.js 18+** (uses the built-in global `fetch`).

---

## 3. Files created (and only these were created)

| File | Responsibility |
|---|---|
| `src/services/bunny.service.js` | The **only** file that talks to Bunny's API. `createVideo(title)` reserves a video and returns Bunny's object (its ID is in `.guid`); `getUploadUrl(videoId)` builds the direct-upload URL; `generateSignedPlaybackUrl(videoId, expiresInSeconds)` builds the signed embed URL. Uses the validated env config; contains no raw key values itself. |
| `src/config/bunny.env.config.js` | Loads `.env` via dotenv and validates the three Bunny variables **at startup** — crashes with a clear error listing every missing one. Exports the frozen, trimmed values (`apiKey`, `libraryId`, `signingKey`) that `bunny.service.js` uses. |
| `src/services/enrollment.stub.service.js` | ⚠️ STUB. `isStudentEnrolledInLessonCourse(studentId, lessonId)` — always returns `true` for now. See section 4. |
| `src/services/lesson.stub.service.js` | ⚠️ STUB. `saveLessonVideoId(lessonId, videoId)` / `getLessonVideoId(lessonId)` backed by an in-memory object. See section 4. |
| `src/routes/video.routes.js` | The two routes: `POST /:lessonId/video` (teacher-only upload prep) and `GET /:lessonId/video-url` (enrollment-gated signed URL). Contains no Bunny calls and no DB calls itself — pure orchestration. |
| `VIDEO_INTEGRATION_README.md` | This document. |

One assumption made per your contract: `requireAuth` is imported as a **named export** — `const { requireAuth } = require("../middleware/auth.middleware.js")`. If your middleware file uses a default export (`module.exports = requireAuth`), change that one line to drop the braces.

---

## 4. STUBS TO REPLACE LATER

> **These are fake placeholders standing in for the database. Do not deploy to production with them in place.**

### Stub 1 — `isStudentEnrolledInLessonCourse(studentId, lessonId)`
- **File:** `src/services/enrollment.stub.service.js`
- **Currently:** always returns `true`, i.e. *every authenticated user can watch every video*.
- **Connect it to:** the real **enrollments** table (via Prisma) once the schema is finalized. It must return `true` only when an enrollment row links this student to the course containing this lesson (depending on how relations end up modelled, that may be lesson → unit → course → enrollments).
- **If never replaced:** paid courses have zero enforcement — any logged-in account (or anyone who obtains any valid token) watches all content free. The entire paywall silently does not exist.

### Stub 2 — `saveLessonVideoId(lessonId, videoId)` and `getLessonVideoId(lessonId)`
- **File:** `src/services/lesson.stub.service.js`
- **Currently:** stores video IDs in a plain JavaScript object inside the running process.
- **Connect them to:** real Prisma reads/writes on the **lessons** table (a `videoId` column or equivalent once the schema is finalized). `getLessonVideoId` must keep returning `null` (not throw) when a lesson has no video yet — the route relies on that to return 404.
- **If never replaced:** every server restart/deploy/crash **wipes all lesson↔video mappings** — teachers would have to re-upload everything, and old Bunny videos become orphaned garbage you still pay storage for. Running more than one server instance also breaks immediately, since each instance has its own private copy.

Both stub files contain full "REPLACE THIS STUB" instructions at the top, including example Prisma code. Because both routes import these functions **from the stub files**, replacing them means editing exactly those two files — no hunting through the codebase, no route changes.

---

## 5. The one line to add to `server.js`

Add this after your other `app.use(...)` registrations (adjust the relative path if `server.js` isn't at the project root):

```js
app.use("/api/lessons", require("./routes/video.routes"));
```

That mounts the router so the final endpoints are exactly:

- `POST /api/lessons/:lessonId/video`
- `GET /api/lessons/:lessonId/video-url`

---

## 6. How to test this

Prerequisites: the three env vars set, `express` installed, your `server.js` running with the line above, and `requireAuth` working (you need a real login token from your auth system to call protected routes).

The examples below use `curl.exe` explicitly because plain `curl` in Windows PowerShell is an alias for `Invoke-WebRequest` and will misbehave.

### A. Verify upload preparation works (teacher)

```powershell
# Replace <TEACHER_TOKEN> with a JWT from your normal login endpoint,
# and 42 with any lesson id (the stub doesn't validate lesson ids).
curl.exe -X POST "http://localhost:3000/api/lessons/42/video" `
  -H "Authorization: Bearer <TEACHER_TOKEN>" `
  -H "Content-Type: application/json" `
  -d "{\"title\":\"Chapter 1 - Cell Structure\"}"
```

Expected: **201** with `{ "videoId": "...", "uploadUrl": "https://video.bunnycdn.com/library/..." }`.
Then check your Bunny dashboard (**Stream → your library**) — an unwatched video entry with that title should appear.

Now actually push a file to Bunny (this is step 2 of the flow, done by the client):

```powershell
curl.exe -X PUT "<uploadUrl from previous response>" `
  -H "AccessKey: <BUNNY_API_KEY>" `
  --data-binary "@C:\path\to\video.mp4"
```

Expected: success response from Bunny; within a minute the dashboard shows the video processing/ready and playable there.

> Security note: direct browser uploads require sending `AccessKey` from the client, which means exposing your API key to the browser. Fine for testing; for production prefer proxying the upload through your server or moving to Bunny's TUS resumable uploads. That change would live entirely inside `bunny.service.js`.

### B. Verify playback works (enrolled student)

```powershell
# Same lesson id you uploaded to; use a STUDENT token.
curl.exe "http://localhost:3000/api/lessons/42/video-url" `
  -H "Authorization: Bearer <STUDENT_TOKEN>"
```

Expected: **200** with a `playbackUrl` like
`https://iframe.mediadelivery.net/embed/<libraryId>/<videoGuid>?token=<64 hex chars>&expires=<unix time>`.

Paste that URL into a browser — the video should play. Wait >3 hours (or temporarily lower `PLAYBACK_URL_LIFETIME_SECONDS` in `src/routes/video.routes.js`) and reload: the same URL must now be rejected by Bunny, proving expiry works. Requesting the endpoint again issues a fresh working URL.

Also verify the 404 path: request `/video-url` for a lesson id that has **no** video saved yet (e.g. restart the server to wipe the in-memory stub store, then try a different lesson id) → expect **404** "No video has been uploaded for this lesson yet."

### C. Verify the 403 rejection works

⚠️ **Important:** while the enrollment stub returns hardcoded `true`, the 403 branch can **never trigger naturally** — every authenticated user passes. That is expected until the stub is replaced. To prove the rejection logic itself works right now, temporarily flip the stub:

```js
// src/services/enrollment.stub.service.js — TEMPORARY test edit
return false; // was: return true;
```

Restart the server and repeat request B:

Expected: **403** with `"You are not enrolled in the course this lesson belongs to."` and **no** playback URL in the response.

Then restore `return true;` (or replace the stub with the real DB check) and confirm playback works again. Also test the teacher gate: send the POST from step A with a **student** token → expect **403** "Only teachers can upload lesson videos."

### D. Quick sanity checklist

- [ ] Server starts with all three env vars set; removing any of them crashes at startup with an error naming every missing variable.
- [ ] Teacher POST → 201 + uploadUrl; video appears in Bunny dashboard.
- [ ] File PUT to uploadUrl → video becomes playable in dashboard.
- [ ] Student GET → 200 + playable signed URL in browser.
- [ ] Signed URL stops working after expiry; fresh request gives a new one.
- [ ] Lesson without video → 404.
- [ ] Stub flipped to `false` → 403; restored → 200 again.

---

## 7. Video Chapters / Timestamps Feature

### Database Model: `VideoChapter` (for Adham's awareness)
A new Prisma database model was added to synchronize labeled video segments:
```prisma
model VideoChapter {
  id               String   @id @default(uuid())
  videoId          String   @map("video_id")
  title            String
  startTimeSeconds Int      @map("start_time_seconds")
  orderIndex       Int      @map("order_index")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@index([videoId])
  @@index([videoId, orderIndex])
  @@map("video_chapters")
}
```

### Backend REST API Endpoints:
- `GET /api/videos/:videoId/chapters` - Returns all chapters for the video (sorted chronologically).
- `POST /api/videos/:videoId/chapters` - Adds a new chapter. Input time format can be seconds (e.g. `200`) or `mm:ss` (e.g. `3:20`).
- `PATCH /api/videos/chapters/:chapterId` - Modifies a chapter's title or start time.
- `DELETE /api/videos/chapters/:chapterId` - Removes a chapter.

All mutating endpoints automatically trigger a re-ordering routing in `src/routes/video-manage.routes.js` that updates the `orderIndex` column sequentially based on the sorted `startTimeSeconds` order.

### How Chapter Editing Works (Teacher Flow)
1. On the teacher dashboard under **إدارة الفيديوهات المرفوعة**, click the **📖 الفصول** (Chapters) button under any video part.
2. Expanding the panel embeds a small preview player.
3. You can add a new chapter by typing a title and entering the time (as minutes:seconds or seconds).
4. Alternatively, play and scrub the preview player, then click **⏱ استخدم الوقت الحالي** to fetch the player's exact playback position dynamically and auto-fill the field.
5. Added chapters are sorted chronologically automatically. You can edit their names/times or delete them inline inside the panel.

