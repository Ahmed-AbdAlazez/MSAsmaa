# QUIZ_README.md — Complete Quiz Feature
===========================================================================

End-to-end quiz system for the MSAsmaa platform: teacher builds quizzes,
students take them under a dual time limit (personal countdown + overall
window), the server grades multiple-choice instantly, leaderboards unlock
only after the quiz closes for everyone, and full answer review unlocks at
the same moment.

**Status: built, wired into `app.js`, backed by REAL DATABASE PERSISTENCE
(Neon Postgres via Prisma), and fully verified by an automated suite —
`58 / 58` checks pass (`node src/scripts/test_quiz_workflow.js`).**

---

## ⚠️ NOTE FOR COLLABORATORS (schema.prisma ownership)

`schema.prisma` is shared. The quiz feature ADDED the following models at the
bottom of the file (below the marker comment). **No pre-existing model was
modified, renamed, or removed** — everything above the marker belongs to the
original author and was left byte-for-byte identical.

| Model (Prisma) | Table (Postgres) | Purpose |
|---|---|---|
| `Quiz` | `quizzes` | one row per exam (title, lesson/course, window, duration) |
| `QuizQuestion` | `quiz_questions` | questions of a quiz (`type` mcq/written, order, image path) |
| `QuizChoice` | `quiz_choices` | the 4 MCQ options per question |
| `QuizAttempt` | `quiz_attempts` | one row per student attempt; submitted rows ARE the results (score, totalMcq, submissionReason, ordering JSON) |
| `StudentAnswer` | `student_answers` | autosaved answer per (attempt, question) |
| `QuizExtraAttempt` | `quiz_extra_attempts` | teacher-granted retry allowance per (quiz, student) |

Migrations creating them:
- `20260823230613_add_quiz_tables`
- `20260823235007_add_attempt_ordering_fields`

`lessonId`, `courseId`, and `studentId` are plain string columns with **no
foreign keys** on purpose: lessons/courses have no tables yet, and attempts
may reference JWT subjects that predate their `users` row.

---

## 1. The flow in plain language

### Teacher creates a quiz
1. `POST /api/quizzes` — attaches a quiz to a lesson with a title, how many
   questions it will have, when it opens (`startTime`), when it closes for
   everyone (`endTime`), and each student's countdown length
   (`durationMinutes`).
2. For every question, `POST /api/quizzes/:quizId/questions`:
   - **MCQ** — text + exactly 4 choices + which one is correct
     (`correctIndex`). The server stores choices as `{id, text}` and keeps
     the correct one as an internal ID.
   - **Written** — text + a *model answer*. This is stored **purely for
     display later**; nothing in the entire codebase ever grades it.
   - Either type may include an image file (`image` field,
     JPG/PNG/WEBP ≤ 5 MB). Only its Supabase Storage **path** is saved.

### Student takes the quiz
3. `POST /api/quizzes/:quizId/start` — allowed only if: enrolled in the
   quiz's course (same enrollment stub as videos/materials), the window is
   open, and they have attempts left. The server records the exact start
   time and computes their personal cutoff = start + durationMinutes.
   The response contains sanitized questions — **never** correct answers or
   model answers — plus `remainingSeconds`.
4. As the student answers, every change is autosaved via
   `POST .../answers`. Close the tab, lose internet, whatever: reopening and
   calling `/start` again finds the same attempt, restores the saved
   answers pre-filled, and continues from the REDUCED remaining seconds
   (server-computed). No teacher approval needed for this.
5. Whichever limit hits first wins. If the personal countdown expires (even
   while away) or the overall `end_time` arrives first, the attempt is
   auto-submitted with whatever answers were saved. A student who reopens
   too late gets `"status":"auto_submitted"` instead of a resume.

### Grading & results
6. On any submission (manual `/submit`, personal-timer expiry, or end-of-
   window cut-off), ONLY MCQ questions are graded server-side by comparing
   choice IDs. Score = correct MCQs; denominator = number of MCQs. Written
   answers are saved but never scored.
7. The student immediately sees their MCQ score only — no right/wrong
   detail yet.
8. After the quiz's `end_time`, two things unlock (checked fresh on EVERY
   request against the server clock):
   - `GET /api/quizzes/:quizId/leaderboard` (+ course cumulative board) —
     ranked lists using each student's BEST attempt; students who never
     attempted appear at the bottom with 0. Real names, intentionally.
   - `GET /api/quiz-results/:resultId/review` — per-question breakdown.
9. Teacher can grant ONE extra attempt per student per quiz
   (`POST /api/quizzes/:quizId/students/:studentId/grant-retry`). Both
   attempts stay stored and visible in `GET .../results`; only the better
   score feeds the leaderboards.

---

## 2. Files added / changed

```
src/services/quiz.stub.service.js          ALL quiz data access (REAL Prisma/Neon
                                           persistence; legacy filename kept so
                                           imports didn't change)
src/services/quizGrading.service.js        pure MCQ grading logic
src/services/supabaseStorage.service.js    +uploadQuizImage/getQuizImageSignedUrl/isAllowedQuizImage
src/routes/quizzes/quiz.routes.js          main router (mounts the five below)
src/routes/quizzes/quiz.helpers.js         shared gates, time math, sanitizing
src/routes/quizzes/quizCreation.routes.js  teacher: create quiz & questions (+image)
src/routes/quizzes/quizTaking.routes.js    student: start/resume/autosave/submit
src/routes/quizzes/quizResults.routes.js   teacher: grant-retry + all attempts
src/routes/quizzes/quizLeaderboard.routes.js  time-gated rankings (quiz + course)
src/routes/quizzes/quizReview.routes.js    time-gated answer reveal
src/scripts/test_quiz_workflow.js          automated verification suite
prisma/schema.prisma                       quiz models ADDED (see notice above)
app.js                                     +1 mount line (see §4)
QUIZ_README.md                             this file
```

`auth.middleware.js` and `server.js` were not touched.

---

## 3. Endpoints (all mounted under `/api`)

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/quizzes` | teacher | create quiz shell |
| GET | `/quizzes/available?courseId=` | authed | Exams Hub feed; optional `courseId` filters one course (legacy no-param call still lists everything) |
| GET | `/quizzes/:quizId` | teacher | quiz metadata |
| GET | `/lessons/:lessonId/quizzes` | teacher | quizzes on a lesson |
| POST | `/quizzes/:quizId/questions` | teacher | add question (multipart, optional `image`) |
| GET | `/quizzes/:quizId/questions` | teacher | FULL questions incl. answers |
| POST | `/quizzes/:quizId/start` | student | start OR auto-resume |
| GET | `/quizzes/:quizId/attempt` | student | state probe (finalizes if expired) |
| POST | `/quizzes/:quizId/answers` | student | autosave one answer `{questionId,value}` |
| POST | `/quizzes/:quizId/submit` | student | submit (optional final `answers` flush) |
| POST | `/quizzes/:quizId/students/:studentId/grant-retry` | teacher | +1 attempt |
| GET | `/quizzes/:quizId/results` | teacher | every attempt of every student |
| GET | `/quizzes/:quizId/leaderboard` | authed | ranking (gated until end_time) |
| GET | `/courses/:courseId/leaderboard` | authed | cumulative ranking (time-gated) |
| GET | `/quiz-results/:resultId/review` | owner/teacher | answer review (gated until end_time) |

Auth = existing JWT middleware: `Authorization: Bearer <token>`; role comes
from `req.user.role` set by `requireAuth`. No header-based role claims.

> **Why per-route middleware:** all five sub-routers share the mount point
> `/api`. A router-level `.use(requireTeacher)` in the creation router would
> also intercept student requests flowing through Express toward the taking
> router. Gates are therefore attached to each route definition.

---

## 4. Exact lines for server.js

**None required.** All routes are mounted in `app.js`, which both
`server.js` (local) and Vercel's `api/index.js` (production) load:

```js
// app.js — already added, right after the notifications router:
app.use("/api", require("./src/routes/quizzes/quiz.routes.js"));
```

If you prefer an explicit import style, replace that line with:

```js
const quizRoutes = require("./src/routes/quizzes/quiz.routes.js");
app.use("/api", quizRoutes);
```

Optional dev-only seeding in `server.js` (display names before the users
table exists — remove once real DB lands):

```js
const { setStudentNameForTesting } = require("./src/services/quiz.stub.service.js");
setStudentNameForTesting("student-a", "سارة أحمد"); // TEST-ONLY helper
```

⚠️ Repo hygiene note: an OLD duplicate pair `src/app.js` + `src/server.js`
exists from before the restructure. Production does NOT use them
(`api/index.js` → root `app.js`), and the pre-existing
`src/scripts/test_workflow.js` points at the stale copy (it fails at health
check even without this feature). Consider deleting the duplicates.

---

## 5. Database persistence (IMPLEMENTED — was previously a stub)

All persistence lives in **one file**: `src/services/quiz.stub.service.js`.
The filename keeps the word "stub" only so every existing import kept
working; the implementation is now **real Prisma against Neon Postgres**.
Every function name and signature is unchanged, so routes/controllers never
noticed the switch.

- Models & tables added: see the collaborator notice at the top of this
  file (`Quiz`, `QuizQuestion`, `QuizChoice`, `QuizAttempt`,
  `StudentAnswer`, `QuizExtraAttempt`).
- The lazy Prisma client in this file adds transparent **cold-start retry**
  for serverless (first request after a Vercel cold start may need to
  re-establish the DB connection).
- Submitted `QuizAttempt` rows double as "results" (`resultId` === attempt
  id) — there is deliberately no separate results table.
- `setStudentNameForTesting` / `setCourseRosterForTesting` remain
  process-local TEST-ONLY overlays: display names resolve from `users` when
  present, and the leaderboard roster stays empty on fresh instances until
  a real enrollments table exists.

---

## 6. How to test this (ACTUAL results)

Run:

```
node src/scripts/test_quiz_workflow.js
```

The suite boots the real Express app on an ephemeral port, mints real JWTs
(same `JWT_SECRET`), and exercises every rule over HTTP. Supabase Storage is
the only stubbed dependency (network isolation); routing, timing, grading,
gating and persistence logic all run for real.

**Actual result of the last full run: `RESULT: 58 passed, 0 failed`**
(windows inside the suite are sized and awaited via `sleepUntil()` so the
suite is stable against remote-database latency; it also self-cleans every
row it creates, including its TEST-12 publish into the real "biology"
course).

### Test 1 — Teacher creates a quiz with mixed types + an image
Steps: login as teacher → create quiz → add 1 MCQ, 1 written, 1 MCQ with
PNG upload → try a 4th question.
```
✓ create quiz -> 201
✓ add MCQ -> 201
✓ add WRITTEN -> 201
✓ add MCQ with IMAGE -> 201 (path stored, no bytes)
✓ adding beyond declared count -> 400
✓ student cannot create quizzes -> 403
✓ teacher sees FULL questions (answers included)
```

### Test 2 — Student starts & completes inside the window (+ leak scan)
```
✓ start WITHOUT token -> 401
✓ NOT-enrolled student -> 403
✓ enrolled student starts -> 201/started
✓ server recorded start + personal deadline
✓ taking view hides correctChoiceId/modelAnswer   ← leak scan on raw JSON
✓ image exposed as signed URL
✓ autosave wrong MCQ choice -> 200
✓ autosave written text -> 200
✓ manual submit -> 200
```
Manual check in the UI equivalent: the start response's questions contain
`choices` but no `correctChoiceId`; written questions expose nothing but
text.

### Test 3 — Auto-submit when the PERSONAL countdown expires
Quiz with `durationMinutes: 0.05` (=3 s) and a long overall window. The
student answers one MCQ correctly, then "walks away" without submitting.
Reopening later must show the attempt as already submitted with their saved
answer graded:
```
✓ quiz2 started (3s personal timer)
✓ remainingSeconds respects the SHORT personal limit
✓ late reopen -> auto_submitted (cannot resume expired attempt)
✓ auto-submitted with SAVED answers graded (1 of 1 MCQ; written excluded,
  reason auto-personal-timer)
✓ auto-submit consumed the attempt: another start -> 403
```

### Test 4 — Auto-submit when the OVERALL end_time hits FIRST
Dedicated case (not assumed from Test 3): `durationMinutes: 60` but
`endTime` only ~2.5 s away. The student's personal timer still shows
~57 minutes of "credit" — the window must still cut them off:
```
✓ start honors the SMALLER limit (~2.5s despite 60min duration)
✓ cut off by END TIME even though personal time remained
  (submissionReason === "auto-quiz-end", submittedAt pinned to the moment
   end_time arrived, saved correct answer scored 1/1)
```

### Test 5 — Immediate score reflects MCQ only
Quiz = 2 MCQ + 1 written. Student answers 1 MCQ right, 1 MCQ wrong, writes
an essay. Submit → score shown instantly:
```
✓ score 1 / totalMcq 2 (written excluded)
✓ submission summary carries NO per-question detail
```

### Test 6 — Leaderboard hidden until end_time
Called while the quiz window is still open:
```
✓ leaderboard locked (released:false, rankings:null)
✓ course board shows student-a with ZERO until quiz releases
  (score hidden, not excluded; quiz listed in pendingQuizzes)
```

### Test 7 — Direct review call before end_time rejected
Bypassing any UI, straight HTTP:
```
✓ DIRECT review call before end_time -> 403 + availableAfter, no data
  (response body: review:null, availableAfter:"...end_time ISO...")
✓ another student cannot open someone else's result (403)
```

### Test 8 — Review after end_time: red/green data + written comparison
Same endpoints called once `Date.now() > endTime`:
```
✓ review now opens -> 200 with review data
✓ MCQ item exposes student choice + correct choice + flag
✓ wrong MCQ: theirChoice≠correctChoice, wasCorrect=false (red/green inputs)
✓ written item: student text + model answer, NO grading flag whatsoever
✓ written never affected the score (still MCQ-only denominator)
```
Frontend rendering contract from these fields:
- **MCQ right** (`wasCorrect:true`) → highlight ONLY the correct choice green.
- **MCQ wrong** (`wasCorrect:false`) → student's choice red AND correct choice green.
- **Written** → render `studentAnswer` and `modelAnswer` side by side / stacked,
  plain styling; there is deliberately no correctness field to bind.

### Test 9 — Granted retry: both results kept, best counts
```
✓ second try WITHOUT grant -> 403
✓ teacher grants retry -> allowance 2
✓ retry start succeeds (attempt #2)
✓ BOTH attempts stored & visible to teacher (0 then 1)
✓ released:true and best score (1) ranked, worst (0) ignored
✓ real names shown; rank computed
```

### Test 10 — Resume after closing the tab
**(a) Happy path — time still remaining:** student starts a 10-minute quiz,
autosaves one answer, "closes the tab" for ~2 s, reopens:
```
✓ reopen -> status 'resumed' (no teacher approval needed)
✓ SAME attempt continues (not a fresh one)
✓ saved answer restored pre-filled
✓ timer REDUCED by time away (not reset)   [600s full → ~598s on reopen]
✓ question order/content identical on resume
```
Manual UI check: reopen shows the previously selected radio/textarea filled
in and the countdown continuing from the reduced value.

**(b) Timer expired while away:** covered in Test 3 — reopening returns
`auto_submitted` with the saved answers graded; the attempt is consumed and
a new one still requires the teacher grant (also asserted).

### Course cumulative board (final state of the run)
```
✓ student-a sums best scores across RELEASED quizzes only (=2)
✓ student-c present with retry-best counted (=1)
✓ still-open quiz5 listed as pending, NOT summed
✓ roster student with zero appears at bottom (not excluded)
```

---

## 7. Security properties enforced server-side

| Threat | Defense | Where |
|---|---|---|
| Student claims teacher via headers | role comes ONLY from verified JWT (`req.user.role`) | auth.middleware + per-route gates |
| Correct answers leak while taking | `sanitizeQuestionForStudent()` strips `correctChoiceId`/`modelAnswer`; leak-scan test proves it | quiz.helpers.js |
| Client lies about elapsed time | start time & personal deadline recorded server-side; all remaining-time math is server-side | quizTaking.routes.js |
| Solving past the deadline | every mutating endpoint re-checks expiry; late autosave triggers finalize instead | quizTaking.routes.js |
| Early leaderboard/review peek | fresh `Date.now() vs endTime` gate on EVERY call, no stored flag | leaderboard + review routes |
| Reading someone else's result | ownership check against JWT id | review route |
| Image access without context | private bucket; signed URLs minted post-auth, 1 h TTL | supabaseStorage.service.js |

## 8. Known limitations (current state)

- Quiz data now **survives restarts and cold starts** (real Neon
  persistence) — the old in-memory wipe problem is gone.
- Leaderboard "never attempted" students come from a process-local roster
  overlay, so they appear only when a test seeds it; production leaderboards
  list students who attempted. This resolves automatically once the real
  `enrollments` table lands (single function to swap:
  `getStudentIdsForCourse`).
- Enrollment ACCESS checks still use `enrollment.stub.service.js`
  (`isStudentEnrolledInLessonCourse`): everyone passes except id
  "student-2". Untouched here because no enrollments/lessons tables exist
  yet in `schema.prisma`.
- `durationMinutes` accepts fractional minutes — handy for timing tests,
  harmless in production.
- The old duplicate `src/app.js` / `src/server.js` pair predates this
  feature; production never loads them.

---

## 9. FRONTEND FLOW (Exams Hub, teacher builder, timer warnings)

The backend above was already complete; this section covers the student and
teacher UI that drives it.

### Files added for the frontend

```
exams.html                       Exams Hub page (student-facing)
css/exams.css                    hub + overlays + builder styles
src/exams.js                     hub logic: tabs, take/resume, autosave,
                                 countdown+warnings, result/leaderboard/review
src/teacherQuizzes.js            teacher builder (flatpickr date-time pickers)
dashboard-teacher.html           + "إنشاء اختبار جديد" section & script tag
index/dashboard-student/dashboard-teacher/lessons/course-biology/
assignments .html                + "الاختبارات" nav link → exams.html
vite.config.js                   + exams build entry
package.json                     + flatpickr dependency
```

### Teacher creation flow (dashboard-teacher.html)
1. New section at the bottom of the teacher dashboard: title, lesson select
   (populated from `curriculum.js`), **start/end time via flatpickr**
   (combined calendar + clock, Arabic locale, AM/PM, 5-min steps), and a
   **duration_minutes number field** right beside them — all three timing
   values in one row.
2. Timezone safety: the pickers hold real `Date` objects; publish sends
   `selectedDates[0].toISOString()` (UTC instant) — nothing is parsed from a
   formatted string, so no timezone shift is possible.
3. Question builder per question: MCQ ↔ Written toggle; MCQ shows exactly 4
   choice inputs each with a radio to mark THE correct one; Written shows a
   model-answer box; optional image upload with instant `<img>` preview.
4. Staged-question list shows everything added so far with type badge,
   answer summary, image thumbnail, and ↑ / ↓ / ✕ reorder-remove buttons
   before publishing.
5. Publish = `POST /api/quizzes` then one multipart
   `POST /api/quizzes/:id/questions` per staged question (progress shown).
   The backend fires the shared enrolled-students notification on create.

### Student flow (exams.html)
- Tabs: **حسب الدرس** (grouped by lesson, names resolved from curriculum.js)
  and **كل الاختبارات** (flat chronological list). Each card shows title,
  lesson, start, end, duration, question count, and a server-computed status
  badge: لم يبدأ بعد / متاح الآن / انتهى.
- Active → opens the take overlay: questions in the attempt's persisted
  shuffle, autosave on every change, live countdown. Ended → result overlay;
  Upcoming → details only, no start button.
- Countdown turns amber at ≤5 min with a toast, red pulsing at ≤1 min with
  another toast (frontend-only; auto-submit timing remains server-owned).
- Result overlay: score banner (MCQ-only), **this quiz's leaderboard table**
  (or a locked note with the unlock time), and the gated review — MCQ wrong
  picks red + correct green, right answers green-only, written answers as
  side-by-side boxes with no grading colors.
- Hub bottom section: **ترتيب الكورس الإجمالي** cumulative board with a note
  listing still-open quizzes excluded from the sum.

### Notifications wiring (verified/fixed)
`POST /api/quizzes` now calls the SHARED
`createNotificationForEnrolledStudents(courseId, message, link)` from
`notifications.stub.service.js` — the same single implementation the video
feature uses. It was previously NOT wired into quiz publishing (an unused
standalone endpoint existed); it now fires automatically on publish with
link `/exams.html`. Non-blocking: notification failure can never fail quiz
creation.

### Randomization (backend support added for the frontend rule)
On every NEW attempt the server shuffles question order AND each MCQ's
choice order (`generateAttemptOrdering`) and stores the permutation on the
attempt (`attempt.ordering`). Resume replays the stored ordering
(`applyAttemptOrdering`) instead of re-shuffling. Grading compares choice
IDs, so display position can never affect correctness.

---

## 10. Frontend test plan & ACTUAL results

Backend-backed checks were run automatically
(`node src/scripts/test_quiz_workflow.js` → **58 passed, 0 failed**, latest
run). UI behaviors were implemented and code-reviewed; browser steps below
are the exact manual checklist.

| # | Test | How verified | Actual result |
|---|---|---|---|
| 1 | Date/time picker saves correct instant, no TZ shift | Automated: suite sends/receives ISO instants end-to-end (all timing tests pass). Manual: pick ٢٤/٨ ٥:٣٠ م → publish → hub card shows same time. | ✅ Suite passes on ISO contract; picker emits `toISOString()` (code-verified). Browser visual check listed in steps below. |
| 2 | Hub groups + Upcoming/Active/Ended labels | Automated (TEST 11): feed returns statuses computed server-side; ended/active asserted. Grouping is pure rendering of `lessonId`. | ✅ statuses verified by API; grouping rendered from same data. |
| 3 | Per-quiz leaderboard on the result page after end_time | Automated (TESTS 6→8): locked before (`released:false`), released after with rankings. exams.js renders exactly these payloads inline on the result overlay. | ✅ API behavior proven; rendering maps 1:1 to response fields. |
| 4 | Cumulative course board on the hub | Automated: course endpoint sums best scores of released quizzes only (=2/=1 checks). Hub section renders the same payload. | ✅ verified via API + same-shape render. |
| 5 | Publishing notifies enrolled students (bell) | Automated (TEST 12): teacher publishes → GET /api/notifications for an enrolled student contains the quiz title. | ✅ **passed** (was broken/not wired — fixed). |
| 6 | Two students see different order | Automated (TEST 13): serialized question+choice orders differ between two students; resume replays identical order; grading still 5/5 by ID. | ✅ **passed**. |
| 7 | Warnings at 5 min & 1 min without breaking auto-submit | Frontend timers fire once each (amber toast + class at 300s, red pulse + toast at 60s). Submit-at-zero calls the SAME submit endpoint whose deadline enforcement is separately covered by TESTS 3+4. | ✅ implemented; backend auto-submit unaffected (58/58 includes both expiry paths). |

### Manual browser checklist (2 minutes)
1. `node server.js` + `npm run dev` → login as teacher → dashboard →
   "إنشاء اختبار جديد": verify calendar/clock popup appears, pick a time,
   add one MCQ (mark correct radio) + one written, publish.
2. Open `exams.html` in another browser as a student: exam shows متاح الآن →
   start → answer → close tab mid-way → reopen: answers restored, timer
   reduced. Submit before time ends.
3. Wait for end_time → reopen result from hub: score banner, leaderboard
   rows, review coloring; bell icon shows the new-quiz notification.
