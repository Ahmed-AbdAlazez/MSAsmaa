# PDF Lesson Materials

Lesson PDFs are private Google Drive files. The browser never receives Google credentials, Drive URLs, or file IDs.

## Environment

The backend reads these OAuth variable names from `.env`:

```env
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
```

The original Service Account variables remain in `.env` for other possible uses, but PDF storage uses OAuth2 for the Gmail account that owns the existing My Drive folder. The OAuth scope is `https://www.googleapis.com/auth/drive` because the application must list, read, create, rename, and delete files already associated with that folder. Do not make the folder or files public.

Run `node src/scripts/authorize-google-drive.js` once locally after creating an OAuth Web application client in Google Cloud Console. Add the exact redirect URI to that client, open the printed authorization URL with the folder-owner Gmail account, and paste the returned code. The helper writes the refresh token into the ignored local `.env` without printing it. Copy the four OAuth variable names and values into the production environment securely.

Supabase variables remain required only by quiz-image storage. They are no longer used for lesson PDFs.

## API

- `POST /api/lessons/:lessonId/materials`: teacher-only multipart upload (`file`, optional `title`).
- `GET /api/lessons/:lessonId/materials`: authenticated, enrollment-gated material list.
- `GET /api/materials/:materialId/download?mode=inline`: authenticated, enrollment-gated PDF stream.
- `GET /api/lessons/:lessonId/materials/manage`: teacher-only management list.
- `PATCH /api/materials/:materialId`: teacher-only Drive filename and metadata title update.
- `DELETE /api/materials/:materialId`: teacher-only Drive deletion followed by metadata deletion.

The `lesson_materials` Prisma table stores the lesson ID, display title, Drive file ID, filename, MIME type, size, and timestamps. It never stores PDF bytes. Students cannot use a Drive file ID or URL directly because Drive files are not public and the stream endpoint checks JWT authentication and enrollment before calling Drive.

All storage failures are logged only as server-side diagnostics and return clean Arabic messages through the existing error middleware.
