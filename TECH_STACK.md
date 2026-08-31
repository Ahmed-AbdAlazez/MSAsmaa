# TECH STACK — منصة الأستاذة أسماء (MSAsmaa)

This document lists every technology, service, language, framework, library and API
**actually used** in this project, verified against the real codebase (`package.json`,
`package-lock.json`, `src/**`, `prisma/schema.prisma`, `vercel.json`, `.env` variable names).
Anything not confirmed with certainty is explicitly marked **needs verification**.

> **Stack at a glance:** Vanilla multi-page HTML/CSS/JS frontend built with **Vite**,
> backed by a **Node/Express** REST API, **PostgreSQL on Neon** via **Prisma**,
> **Bunny Stream** for video, **Supabase Storage** for files, custom **JWT + bcrypt** auth,
> deployed as a **Vercel** serverless function + static site.

---

## 1. PROGRAMMING LANGUAGES

| Language | Where used |
|---|---|
| **JavaScript (Node.js, CommonJS)** | Backend API (`src/**`, `app.js`, `server.js`, `api/index.js`). Server must be **Node ≥ 18** (relies on global `fetch`). |
| **JavaScript (ES Modules / browser)** | Frontend pages (`src/main.js`, `src/exams.js`, `src/loginPage.js`, `src/teacherQuizzes.js`, etc.) built by Vite. |
| **HTML5** | All frontend pages (13 static `.html` files in project root). RTL, Arabic. |
| **CSS3** | All styling (`css/style.css`, `css/login.css`, `css/exams.css`, `css/mascot.css`). Custom properties (CSS variables) for the design system. |
| **SQL (PostgreSQL)** | Implicit — via Prisma ORM. No raw SQL written in app code. |

> No TypeScript. Frontend is multi-page static HTML — **not** a React/Vue/Angular SPA.

---

## 2. FRONTEND

- **Framework/library:** **None** — plain HTML/CSS/JS multi-page app (13 static `.html` pages). No React/Vue/Svelte.
- **Build tool:** **Vite** — version **8.2.2** (confirmed in lockfile). Build script: `vite build`; dev server: `vite --host`.
- **Styling approach:** Hand-written CSS3 with **CSS variables (custom properties)** in `css/style.css`
  (brand greens, Tajawal font, `--radius-*`, glass cards). No CSS framework (no Tailwind/Bootstrap).
- **Major frontend libraries:**
  - **flatpickr `4.6.13`** — date/time picker for quiz schedule windows and duration setup
    (used in `src/teacherQuizzes.js` with the Arabic locale `flatpickr/dist/l10n/ar.js`).
  - No animation libraries (no GSAP), no charts, no date-fns/axios/jQuery/SweetAlert — **none found** in source or HTML.
- **State / data-fetching libraries:** **None** — state is plain JS variables; data is fetched with the browser's
  native `fetch` against the API. No React Query / SWR / Axios.

### Frontend source pages
`index.html` (homepage), `login.html`, `forgot-password.html`, `reset-password.html`,
`courses.html`, `course-biology.html`, `lessons.html`, `lesson-view.html`, `exams.html`,
`students.html`, `registration-requests.html`, `student-mistakes.html`, `dashboard-teacher.html`.

---

## 3. BACKEND

- **Runtime:** Node.js (**≥18**; global `fetch` is used by the Bunny service). `engines` field: `>=18`.
- **Framework:** **Express `4.22.2`** (confirmed installed, `^4.21.2` in package.json).
- **ORM:** **Prisma `6.19.3`** / `@prisma/client` `6.19.3` (confirmed installed). Generated client cached
  on `globalThis` in `src/config/db.js` for Vercel serverless warm starts.
- **Authentication approach (actual, current):**
  - **Custom JWT** via **jsonwebtoken `9.0.3`** — `signToken`/`verifyToken` in `src/utils/jwt.js`.
  - **Password hashing** via **bcryptjs `3.0.3`** — salt rounds **12** (`src/utils/password.js`).
  - Guard middleware: `protect` (validates `Authorization: Bearer <token>`, reloads user) +
    `restrictTo('TEACHER','STUDENT')` in `src/middlewares/authMiddleware.js`.
  - Roles: `TEACHER` / `STUDENT` (enum in schema). Student signup goes to `PENDING` awaiting teacher approval.
  - **Password reset:** self-issued one-time token (SHA-256 hashed, 15-min expiry) returned directly —
    **no external email service** is used.
- **Middleware / key backend libraries:**
  - **cors `2.8.5`** — global CORS in `src/app.js`.
  - **multer `2.2.0`** — in-memory file uploads (PDFs, quiz images).
  - **dotenv `16.4.7`** — env loading.
  - **pdfjs-dist `3.11.174` + pdf-lib `1.17.1` + @napi-rs/canvas `0.1.80`** — PDF normalization service
    (re-rasterizes uploaded PDFs and rebuilds standards-compliant files before storage).
- **Entry points:** `server.js` (local always-on), `src/server.js` (serverless-style local),
  `api/index.js` (Vercel serverless wrapper around `src/app.js`).

---

## 4. DATABASE

- **Engine:** **PostgreSQL** (Prisma datasource `provider = "postgresql"`).
- **Hosting provider:** **Neon** (confirmed — the deployed `DATABASE_URL` points to a `*.neon.tech` host).
- **Pooled vs direct:** The **direct (serverless) connection string** is in use
  (`?sslmode=require`, no `pgbouncer=true` pooled suffix). The pooled variant is **not** configured.
  > ⚠️ `.env.example` is **stale** — it still documents a **Supabase Postgres** URL
  > (`...supabase.co:5432/postgres`). The real deployment uses Neon. This file should be updated.
- **Connection management:** Prisma client singleton on `globalThis` (avoids pool exhaustion on Neon serverless).
- **ORM version:** Prisma 6.19.3.

### Actual data models in `prisma/schema.prisma` (confirmed)
| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Students + teachers; `studentCode`, `name`, `password` (hashed), `email`, role, approval `status`, password-reset fields. |
| `Notification` | `notifications` | Per-user in-app alerts (read state, related-type/link). |
| `Quiz` | `quizzes` | Published exam; mixed-flag, question count, start/end window, per-student duration. |
| `QuizLesson` | `quiz_lessons` | Join table linking a mixed quiz to covered lessons. |
| `QuizQuestion` | `questions` | MCQ or written question; correct choice id, model answer, optional image. |
| `QuizChoice` | `choices` | MCQ options (`c1`..`c4`). |
| `QuizAttempt` | `quiz_attempts` | One row per attempt (in-progress **or** submitted); personal deadline, score, per-attempt shuffle ordering, fullscreen-exit count. |
| `StudentAnswer` | `student_answers` | Autosaved answer per question (enables resume-after-close). |
| `StudentMistake` | `student_mistakes` | Recorded incorrect answers → powers the “أخطائي” feature. |
| `QuizExtraAttempt` | `quiz_extra_attempts` | Teacher-granted additional attempts (allowance = 1 + extra). |
| `LessonNote` | `lesson_notes` | Teacher-written dynamic notes under a video. |
| `VideoChapter` | `video_chapters` | Labeled chapters/timestamps for uploaded videos. |

> Note: There is **no** dedicated `Course`/`Lesson`/`Material`/`Enrollment` table yet.
> Lesson/course metadata is currently stubbed (`src/services/lesson.stub.service.js`) and
> the lesson→video mapping lives **on Bunny** inside video titles (see §5). The Prisma
> schema comment explicitly notes the missing lessons/courses tables as a known gap.

---

## 5. FILE STORAGE & MEDIA

### Video — Bunny Stream
- **Provider:** Bunny.net Stream (API base `https://video.bunnycdn.com`, embed base `https://iframe.mediadelivery.net/embed`).
- **Integration** (`src/services/bunny.service.js`):
  - **BUNNY_API_KEY** → creates videos, lists library, uploads, renames, deletes (sent as `AccessKey` header).
  - **BUNNY_LIBRARY_ID** → selects the video library.
  - **BUNNY_SIGNING_KEY** → **signed playback URLs**:
    `token = SHA256(signingKey + videoId + expiryUnix)`; default lifetime **3 hours**.
  - **Lesson→video mapping is not in the DB.** It is inferred by scanning every library video
    and matching by **title convention** (`"{lessonId} | name | attachmentUrl | description"`),
    paginated through the whole library, cached in-memory (~60s TTL).
  - Node ≥18 required; env vars validated at startup (`src/config/bunny.env.config.js`).

### Files/PDFs & images — Supabase Storage
- **Provider:** Supabase Storage via `@supabase/supabase-js 2.112.3`.
- **Integration** (`src/services/supabaseStorage.service.js`):
  - **SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY** (server-side `createClient`, `persistSession:false`).
  - Buckets: **`lesson-materials`** (PDFs) and **`quiz-images`**.
  - Auto-creates the bucket and sets an explicit CORS origin policy; files served via **signed/bucket URLs**.
  - Optional `MATERIALS_CORS_ORIGINS` overrides default `*`.

---

## 6. HOSTING & DEPLOYMENT

- **Frontend + Backend deployment:** **Vercel** (confirmed: `vercel.json` + `api/index.js`; `VITE_API_URL` set to
  `https://ms-asmaa.vercel.app/api/v1`).
  - Static frontend pages are served by Vercel; every `/api/*` request is **rewritten** (`vercel.json`) to the
    single `api/index.js` serverless function (`maxDuration: 60s`), which hands off to the shared Express app.
- **Domain:** Custom Vercel domain **`ms-asmaa.vercel.app`** (per config). Registrar — **needs verification**
  (no registrar config found in repo; if a custom apex domain is attached it is configured in the Vercel dashboard).
- **CI/CD:** Driven by Vercel’s Git integration (auto-deploy on push to the connected branch).
  No `.github/workflows` present. **needs verification** for the exact connected branch/repo.

---

## 7. THIRD-PARTY SERVICES / APIs

| Service | SDK / method | Used for |
|---|---|---|
| **Bunny.net Stream API** | raw `fetch` (REST) | Video create/upload/encode status/rename/delete, plus **signed playback URLs**. |
| **Supabase Storage API** | `@supabase/supabase-js` (service-role) | PDF lesson materials + quiz image storage, bucket/CORS mgmt, signed URLs. |
| **Neon (PostgreSQL)** | Prisma | Hosted relational database (all persistence). |
| **Vercel** | platform | Static frontend hosting + serverless backend functions. |
| (No email service — nodemailer/SendGrid/Resend **not found**; password reset is email-free.) | | |

> The “WhatsApp deep link for support contact” from earlier planning was **not found** in the current code — not implemented (or removed).

---

## 8. KEY FEATURES BUILT (brief list)

- Authentication: student signup (pending teacher approval) + teacher/student login, JWT + bcrypt.
- **Approval workflow** — teacher approves/rejects registration requests.
- **Videos with chapters** — Bunny-backed playback; labeled timestamps; teacher upload/manage; lesson notes.
- **PDF materials** — teacher upload → Supabase Storage, with PDF normalization pipeline.
- **Quizzes** — teacher creation, scheduling, mixed quiz type, per-question types (MCQ/written).
- **Per-attempt timing** — personal countdown deadline, fullscreen-exit tracking, resume-after-close (autosave).
- **Quiz leaderboard** — results/ranking per quiz.
- **“أخطائي” (My Mistakes)** — recorded incorrect answers for students; teacher mistake view.
- **Teacher student-detail view** — per-student quiz/mistake/attempt detail.
- **Extra attempts** — teacher grants additional attempts per student.
- **Notifications** — per-user in-app alerts.
- **Homepage** — marketing/hero, features, top students sections.
- **Dark mode** — CSS variable-driven theme.
- **Password reset (email-free)** — verified student identity → one-time token.

---

## 9. ENVIRONMENT VARIABLES REQUIRED

Names only (never values). Source: `.env` var names + code references.

| Variable | Purpose |
|---|---|
| `PORT` | Local server port (optional; default varies by entry point). |
| `NODE_ENV` | `development`/`production`; toggles Prisma logging & client caching. |
| `DATABASE_URL` | Postgres connection string (current value is a **Neon** direct/`?sslmode=require` URL). |
| `JWT_SECRET` | Secret used to sign/verify JWTs. |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`). |
| `TEACHER_CODE` | Teacher seed student-code (prisma/seed.js). |
| `TEACHER_NAME` | Teacher seed display name (default “Ms. Asmaa”). |
| `TEACHER_PASSWORD` | Teacher seed password. |
| `BUNNY_API_KEY` | Bunny Stream management API key (create/upload/list/delete videos). |
| `BUNNY_LIBRARY_ID` | Bunny Stream video library numeric ID. |
| `BUNNY_SIGNING_KEY` | Bunny signing key for token-authenticated playback URLs. |
| `SUPABASE_URL` | Supabase project URL (Storage). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service-role** secret key (server-side Storage writes; never client). |
| `MATERIALS_CORS_ORIGINS` | Optional comma-separated allowlist for the materials bucket CORS (default `*`). |
| `VITE_API_URL` | Frontend API base for auth calls, e.g. `https://ms-asmaa.vercel.app/api/v1`. |
| `LESSON_1_VIDEO_ID` | Seed/fallback video id for `lesson-1` (optional; lessons stub service). |

---

## FLAGGED ITEMS — unused / leftover / uncertain (review separately)

- **`.env.example` is outdated** — documents a **Supabase Postgres** `DATABASE_URL`, but the real deployment uses **Neon**. Should be corrected to avoid future misconfiguration.
- **`dist/` is committed & tracked** (37 files) but is **not** in `.gitignore` — leftover misconfiguration (see `MERGE_CONFLICT_RESOLUTION_REPORT.md`); build output typically shouldn’t be tracked.
- **Duplicate auth middleware:** `src/middleware/auth.middleware.js` **and** `src/middlewares/authMiddleware.js` both exist. Only `auth.middleware.js` (with `protect`/`restrictTo`) is referenced by routes — the other appears redundant (needs verification before removal).
- **Multiple server entry files:** root `server.js` AND `src/server.js` both start an Express server. `api/index.js` (Vercel) is the actual production entry; the root/server-local entries are for local dev — **needs verification** which is canonical.
- **Stub/no-DB layers:** `src/services/lesson.stub.service.js` and the in-memory Bunny title-scan act as stand-ins because there is **no** `Course`/`Lesson` table yet.
- **Seed/leftover scripts:** `src/scripts/*` contain many one-off test scripts (`test_quiz_*.js`, `_tmp_probe2.js`, etc.) using hardcoded test JWT secrets — development tooling, not production code.
- **Dead CSS (harmless):** `css/mascot.css` still contains `.scroll-shape`, `.scroll-decor`, `.bottom-zone` rules for decorative shapes removed during the homepage cleanup.
- **WhatsApp support deep-link:** mentioned in planning context but **not found** in current code — either never added or removed.
