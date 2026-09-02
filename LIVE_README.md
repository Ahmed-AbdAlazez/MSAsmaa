# البث المباشر | Daily.co Live Streaming (LIVE_README)

Embedded live video lectures for the MSAsmaa biology platform using **Daily.co**.
The whole call UI (teacher camera/mic, participant grid, chat, host controls) is
rendered **inside the platform page** via Daily Prebuilt (an embedded `<iframe>`),
not an external link or redirect.

---

## 1. SETUP NEEDED FROM YOU (daily.co account / keys)

To enable **real** live calls, create (or reuse) a Daily.co account and add one
key. Without it the feature still builds and runs end-to-end in an isolated
**STUB / DEV mode** (see §4), so you can test the UI before the key exists.

### Steps
1. Sign up at <https://dashboard.daily.co> (free tier allows 1 concurrent room).
   Your API key is under **Developer → API Keys** (looks like
   `5522b3383d2e7cfc36f0d9e58aa3f3e0d…`).
2. Add it to your local `.env` (already scaffolded at the bottom of `.env`):

   ```env
   DAILY_API_KEY=5522b3383d2e7cfc36f0d9e58aa3f3e0d...   # required to go live
   DAILY_DOMAIN=myteam                                   # optional; derived from key if omitted
   DAILY_ROOM_PREFIX=msasmaa                             # optional room-name namespace
   ```

   - `DAILY_DOMAIN` is your Daily subdomain, e.g. `myteam` → `https://myteam.daily.co/…`.
   - If omitted, the subdomain is **auto-derived from the API key** (first 7 hex
     chars), which is Daily's standard convention.
3. Add the same `DAILY_API_KEY` to the **Vercel environment variables** for the
   production deployment (`ms-asmaa.vercel.app`).
4. Restart the server. There is **no schema.prisma, no migration, and no
   auth.middleware edit** required — see §5.

> If you leave `DAILY_API_KEY` empty, nothing breaks: the backend returns
> clearly-marked stub rooms and the UI shows a "وضع تجريبي" toast so testers
> instantly know the real key is still pending.

---

## 2. How it works (flow)

### Teacher side
- A **"📡 بدء بث مباشر"** button appears in the live bar under the navbar on the
  teacher dashboard (and every teacher page).
- Clicking it → `POST /api/live/start`:
  1. Creates (or reuses) a private Daily room.
  2. Mints an **owner** meeting token for the teacher → host controls
     (mute/unmute her own mic, toggle camera, mute/end participants, end call).
  3. Registers the session as LIVE.
  4. 📢 Notifies **every approved student** via the existing notification system
     (same `createNotificationForApprovedStudents` pattern used for
     video-upload / quiz-published alerts). Type `live`, link `/exams.html#live`.
- The Daily Prebuilt call opens **embedded in the page** (a full-page overlay with
  the call frame), NOT a new tab.

### Student side
- While live, a prominent **"🔴 بث مباشر الآن"** banner is injected under the
  navbar on **every page** (exams hub, lesson pages, homepage, courses).
- A notification arrives in the bell with the same pattern as other platform
  notifications.
- Clicking the banner → `POST /api/live/join` (enrollment-gated) → returns the
  room URL + a **participant** token → the same embedded Prebuilt call opens
  in-page. Camera **OFF** and mic **OFF** by default (lecture-style).

### Ending
- The teacher clicks **"✕ إنهاء"** on the embedded call → `POST /api/live/end`
  → deletes the Daily room, clears the LIVE flag, and notifies students the
  stream ended. The banner disappears everywhere within ~15s (poll).

---

## 3. Routes (`src/routes/live.routes.js`, mounted in `app.js` under `/api`)

| Method | Path            | Access | Purpose |
|--------|-----------------|--------|---------|
| POST   | `/api/live/start` | teacher only | create room + owner token, register LIVE, notify students |
| GET    | `/api/live/status`| teacher or **enrolled** student | is a session live? returns room name + title (no secrets) |
| POST   | `/api/live/join`  | teacher or **enrolled** student | mint a participant token (student: audio+video OFF; teacher: owner) |
| POST   | `/api/live/end`   | teacher only | tear down room, clear LIVE, notify ended |

All `join`/`status` are gated by `isStudentEnrolledInLessonCourse`
(`src/services/enrollment.stub.service.js`) — the **same enrollment check used
everywhere else**. PENDING/REJECTED students get `403`; the teacher always passes.

---

## 4. Stub / DEV mode (no DAILY_API_KEY yet)

Files involved:
- `src/config/daily.env.config.js` — reads/validates env; `isConfigured` is false
  when no key.
- `src/services/daily.service.js` — the **only** file that talks to Daily. When
  unconfigured, `createRoom`/`createMeetingToken` return fabricated, clearly-marked
  values (`https://stub/...?needs_daily_api_key=1`, `stub-token-…`) so the routes
  and UI run end-to-end without the key. When a key is added, the same code calls
  the real Daily REST API — nothing else changes.

---

## 5. Conflict-safe design (no risky edits)

- **No `prisma/schema.prisma` edits.** Live session state lives in an in-memory
  registry (`src/services/liveSession.service.js`), same stub pattern as
  `lesson.stub.service.js`. The room name is deterministic (`msasmaa-live`), so it
  survives restarts.
- **No `auth.middleware.js` edits.** Reuses existing `requireAuth`.
- **Reuses** the existing enrollment check + notification service.
- Frontend is an isolated module **`src/liveSession.js`** exporting a factory
  `initLiveStreaming({ API_BASE, authHeaders, fetchJson, showToast })` — the exact
  dependency-injection pattern of `initStudentsPage` / `initStudentMistakesPage`.
- **No React**: this repo is vanilla multi-page HTML/CSS/JS, so we deliberately
  used **Daily Prebuilt** (embedded iframe + `daily-js` `createFrame`) instead of
  the React SDK — zero React, zero build/env changes, and it gives full host
  controls, theming, and mobile responsiveness natively.

### Follow-ups / known limitations (fast-follow, not blocking)
- **Serverless persistence:** the in-memory live flag is lost on a Vercel cold
  start mid-session (the Daily room itself persists ~5h, so students who already
  know the session is live can still join). A durable fix = a `LiveSession` Prisma
  table — a schema.prisma change, intentionally not made here.
- **Students muted-by-default:** implemented via `start_audio_off`/`start_video_off`
  on meeting tokens, plus `canSend` permissions. The teacher (owner) can unmute a
  specific student for Q&A using Daily's in-call participant controls. (Daily
  allows owners to mute/unmute others in Prebuilt.)
- **Theme:** applied via `createFrame({ theme })` with light+dark variants matching
  the site palette; re-applied on theme toggle and via `prefers-color-scheme`.

---

## 6. Files touched

| File | Change |
|------|--------|
| `src/services/daily.service.js` | **New** — Daily API client (real + stub mode) |
| `src/config/daily.env.config.js` | **New** — env validation/derivation |
| `src/services/liveSession.service.js` | **New** — in-memory live flag |
| `src/routes/live.routes.js` | **New** — start/status/join/end endpoints |
| `app.js` | Mounted live routes |
| `src/liveSession.js` | **New** — frontend component (indicator + button + embedded call) |
| `src/main.js` | Imported + wired `initLiveStreaming` |
| `css/style.css` | Live bar + embedded stage styles (light/dark, responsive) |
| `.env.example` / `.env` | Documented `DAILY_*` vars |
| `dist/**` | Regenerated build output |

---

## 7. Testing guide

1. **Teacher starts:** log in as the teacher → dashboard → "📡 بدء بث مباشر" →
   confirm the embedded Daily call opens in-page (camera on, mic muted).
2. **Enrolled student joins (different account/browser):** see the 🔴 banner +
   bell notification → click → embedded call opens in-page, sees/hears the
   teacher, own camera + mic OFF.
3. **Not-enrolled student:** login → no join token → `403` (backend) / toast (UI).
4. **End:** teacher closes → everyone leaves the embedded call cleanly, banner
   disappears.
5. **Mobile width** and **dark mode**: the Prebuilt frame is responsive, and the
   light/dark theme follows the site toggle.
