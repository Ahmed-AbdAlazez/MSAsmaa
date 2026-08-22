# PDF Lesson Materials Integration (Supabase Storage)

This adds isolated backend support for teacher-uploaded PDF materials stored in the private Supabase Storage bucket `lesson-materials`.

## How The Flow Works

Teacher upload:

1. A teacher sends `POST /api/lessons/:lessonId/materials` with one PDF in the multipart field named `file`.
2. `requireAuth` identifies the user, then the route checks `req.user.role === "teacher"`.
3. `multer` reads the PDF into memory and rejects files over 20MB.
4. The route rejects anything that is not a PDF by checking both MIME type and `.pdf` extension.
5. `uploadPdf()` stores the file in the private Supabase bucket and returns the private storage path.
6. `saveMaterialRecord()` saves the lesson ID, title, and storage path in the temporary material stub.

Student download:

1. A logged-in user calls `GET /api/lessons/:lessonId/materials`.
2. The route calls `isStudentEnrolledInLessonCourse(req.user.id, lessonId)`.
3. If enrolled, the response returns material IDs and titles only. It does not return private file paths or download links.
4. The user then calls `GET /api/materials/:materialId/download`.
5. The route loads the material record, checks enrollment against the material's lesson, then creates a short-lived Supabase signed download URL.

Materials are independent of videos. A lesson can have a video only, a PDF only, both a video and PDFs, or neither. The materials route never checks whether a Bunny video exists.

## Teacher Management (List / Rename / Delete)

Teacher-only endpoints, following the same conventions as `video-manage.routes.js`
(role gate via `requireAuth` + `req.user.role === "teacher"`, Arabic success/error messages):

```text
GET    /api/lessons/:lessonId/materials/manage   full list incl. title, upload date, size (teacher-only)
PATCH  /api/materials/:materialId                rename — body { "title": "new name" }
DELETE /api/materials/:materialId                permanent delete (storage file + record)
```

### End-to-end flow

- **Manage list:** the teacher dashboard ("إدارة مواد الدرس PDF") loads the manage route and renders each PDF with its title, upload date and file size. The student-facing list endpoint stays unchanged and keeps returning IDs/titles only.
- **Rename:** `PATCH` calls `updateMaterialTitle()`, which MOVES the Supabase object to a new name that percent-encodes the custom title (`ttl_<encoded-title>--<base>.pdf`). Every later list/download call decodes it back automatically, so renames survive serverless restarts without a database. Any language works (Arabic titles included).
- **Delete:** see the safeguard below.

### Delete-order safeguard

The DELETE route performs two steps strictly in order:

1. `deleteFile(materialRecord.filePath)` removes the actual object from Supabase Storage.
2. ONLY if step 1 succeeded, `deleteMaterialRecord()` removes the record reference.

If storage deletion fails, the route stops and returns an error WITHOUT deleting the record — so there is never a record pointing at an existing file, and never a file left behind whose record was already removed.

### Ownership check status

There is no course-ownership model in this project yet (video management has none either — single-teacher platform). Both PATCH and DELETE therefore call `isTeacherOwnerOfLesson(teacherUserId, lessonId)`, which currently always returns `true`. This is a flagged stub in `material.stub.service.js`; when courses gain real owner data it must return `false` unless `teacherUserId` owns the course containing `lessonId`.

## Environment Variables

These are read from `process.env` and are never hardcoded:

```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-server-side-service-role-key
```

`src/services/supabaseStorage.service.js` throws a startup error if either value is missing.

## Files Created

| File | Responsibility |
|---|---|
| `src/services/supabaseStorage.service.js` | Owns all Supabase Storage calls. Uploads PDFs to `lesson-materials` and creates signed download URLs. |
| `src/services/material.stub.service.js` | Temporary in-memory material records: lesson ID, title, file path, and created date. |
| `src/routes/materials.routes.js` | Express routes for teacher upload, material listing, and signed PDF download. |
| `MATERIALS_README.md` | This documentation. |

## STUBS TO REPLACE LATER

These functions are fake placeholders and must be connected to real database tables before production.

| Function | File | Replace With |
|---|---|---|
| `saveMaterialRecord(lessonId, title, filePath)` | `src/services/material.stub.service.js` | Insert into a real `materials` table with columns like `id`, `lessonId`, `title`, `filePath`, and `createdAt`. |
| `getMaterialsForLesson(lessonId)` | `src/services/material.stub.service.js` | Query the real `materials` table by `lessonId`, ordered by creation time or lesson display order. |
| `getMaterialById(materialId)` | `src/services/material.stub.service.js` | Query the real `materials` table by primary key and return the associated lesson ID and storage path. |
| `updateMaterialTitle(materialId, newTitle)` | `src/services/material.stub.service.js` | UPDATE the title column. The current implementation encodes the title into the storage object name (via a move) so it persists without a database. |
| `deleteMaterialRecord(materialId)` | `src/services/material.stub.service.js` | DELETE the row by primary key (called only after storage deletion succeeds). |
| `isTeacherOwnerOfLesson(teacherUserId, lessonId)` | `src/services/material.stub.service.js` | Real course-ownership check: return false unless the teacher owns the course containing the lesson. Currently always returns true. |
| `isStudentEnrolledInLessonCourse(studentId, lessonId)` | `src/services/enrollment.stub.service.js` | Query the real enrollment data so only students enrolled in the course containing the lesson pass. |

A real `materials` table should store at least:

```text
id
lessonId
title
filePath
createdAt
```

`filePath` is the private Supabase Storage object path returned by `uploadPdf()`.

## Line To Add To The Server

Do not edit `server.js` for this feature if you are following the isolation rule. In this project, routes are registered in root `app.js`, so add this line near the other route mounts:

```js
app.use("/api", require("./src/routes/materials.routes.js"));
```

After mounting, the final endpoints are:

```text
POST /api/lessons/:lessonId/materials
GET /api/lessons/:lessonId/materials
GET /api/materials/:materialId/download
```

## How To Test This

The examples below use the current dev auth middleware headers:

```text
x-user-id: teacher-1
x-user-role: teacher
```

or:

```text
x-user-id: student-1
x-user-role: student
```

### 1. Teacher uploads a PDF to a lesson that already has a video

```powershell
curl.exe -X POST "http://localhost:3000/api/lessons/lesson-1/materials" `
  -H "x-user-id: teacher-1" `
  -H "x-user-role: teacher" `
  -F "title=Support and movement notes" `
  -F "file=@C:\path\to\material.pdf;type=application/pdf"
```

Expected: `201` with a material ID and title.

### 2. Teacher uploads a PDF to a lesson with no video

```powershell
curl.exe -X POST "http://localhost:3000/api/lessons/lesson-without-video/materials" `
  -H "x-user-id: teacher-1" `
  -H "x-user-role: teacher" `
  -F "title=Standalone PDF lesson" `
  -F "file=@C:\path\to\material.pdf;type=application/pdf"
```

Expected: `201`. This confirms PDFs do not depend on Bunny video state.

### 3. Enrolled student lists and downloads materials

```powershell
curl.exe "http://localhost:3000/api/lessons/lesson-1/materials" `
  -H "x-user-id: student-1" `
  -H "x-user-role: student"
```

Expected: `200` with material IDs and titles only.

Then download:

```powershell
curl.exe "http://localhost:3000/api/materials/material-1/download" `
  -H "x-user-id: student-1" `
  -H "x-user-role: student"
```

Expected: `200` with a temporary `downloadUrl`.

### 4. Student not enrolled gets 403 on list and download

The current enrollment stub always returns `true`, so this branch cannot trigger naturally yet. To test the route behavior before the real database exists, temporarily change `src/services/enrollment.stub.service.js` to return `false`, restart the server, and call:

```powershell
curl.exe "http://localhost:3000/api/lessons/lesson-1/materials" `
  -H "x-user-id: student-2" `
  -H "x-user-role: student"
```

Expected: `403` and no material list.

For download:

```powershell
curl.exe "http://localhost:3000/api/materials/material-1/download" `
  -H "x-user-id: student-2" `
  -H "x-user-role: student"
```

Expected: `403` and no `downloadUrl`.

Restore the stub after this test.

### 5. Uploading a non-PDF is rejected clearly

```powershell
curl.exe -X POST "http://localhost:3000/api/lessons/lesson-1/materials" `
  -H "x-user-id: teacher-1" `
  -H "x-user-role: teacher" `
  -F "file=@C:\path\to\not-a-pdf.txt;type=text/plain"
```

Expected: `400` with `Only PDF files are allowed for lesson materials.`

Uploading a PDF larger than 20MB should return `400` with `PDF upload failed. Files must be 20MB or smaller.`

### How To Test The Management Flow (teacher)

All examples use `x-user-id: teacher-1` + `x-user-role: teacher`. The UI equivalent lives on `dashboard-teacher.html` under "إدارة مواد الدرس PDF": pick chapter + lesson, press the load button, then use the edit/delete buttons per row.

**1. Teacher sees all PDFs for a lesson**

```powershell
curl.exe "http://localhost:3000/api/lessons/lesson-1/materials/manage" `
  -H "x-user-id: teacher-1" -H "x-user-role: teacher"
```

Expected: `200` with `{ materials: [ { id, title, createdAt, sizeBytes } ] }`. A student calling this gets `403 Only teachers can manage lesson materials.`

**2. Teacher renames a PDF and the new title shows**

```powershell
curl.exe -X PATCH "http://localhost:3000/api/materials/<MATERIAL_ID>" `
  -H "x-user-id: teacher-1" -H "x-user-role: teacher" `
  -H "Content-Type: application/json" `
  -d "{\"title\":\"ملف الحل الجديد\"}"
```

Expected: `200 { message: "تم حفظ التعديلات بنجاح." }`. Re-run test 1 (and the student list) — the new title appears. Empty title → `400 A non-empty title is required.` Unknown ID → `404 المادة غير موجودة.`

**3. Teacher deletes a PDF and it disappears everywhere**

```powershell
curl.exe -X DELETE "http://localhost:3000/api/materials/<MATERIAL_ID>" `
  -H "x-user-id: teacher-1" -H "x-user-role: teacher"
```

Expected: `200 { message: "تم حذف المادة بنجاح." }`. Verify in the Supabase dashboard (Storage → `lesson-materials` → `lessons/<lessonId>/`) that the object is gone, then re-run tests 1 and the student list — the material must no longer appear.

**4. Deleting a non-existent material fails clearly**

```powershell
curl.exe -X DELETE "http://localhost:3000/api/materials/bm90LWEtcmVhbC1wYXRoLnBkZg==" `
  -H "x-user-id: teacher-1" -H "x-user-role: teacher"
```

Expected: `404 { error: "المادة غير موجودة." }` — a clean JSON error, not a crash. (The sample ID base64-decodes to `not-a-real-path.pdf`, which fails the path-shape check.)
