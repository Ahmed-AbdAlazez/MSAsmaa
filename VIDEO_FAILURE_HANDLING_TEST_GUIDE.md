# Video Readiness & Failure Handling - Test Guide

## Overview
This document guides you through testing the three implemented behaviors for Bunny Stream video processing:

1. **Never show unready videos to students** - Processing and failed videos are hidden from students
2. **Notify teacher on failure** - Automatic notification sent when video encoding fails
3. **Auto-cleanup failed videos** - Delete from Bunny and clear database reference

---

## Test Environment Setup

### Prerequisites
- Node.js 18+ running
- Bunny Stream API credentials configured in `.env`:
  ```
  BUNNY_API_KEY=<your-key>
  BUNNY_LIBRARY_ID=<your-library-id>
  BUNNY_SIGNING_KEY=<your-signing-key>
  ```
- Database connection working
- Teacher and Student accounts created in the system

### Database Verification
Before testing, verify your database has these models:
```sql
SELECT * FROM users WHERE role = 'TEACHER' LIMIT 1;
SELECT * FROM users WHERE role = 'STUDENT' AND status = 'APPROVED' LIMIT 1;
SELECT * FROM notifications LIMIT 1;
```

---

## Test 1: Normal Upload Flow (Verification - Should Be Unchanged)

**Objective:** Confirm that successful video uploads still work exactly as before.

### Steps:
1. **Login as Teacher**
   ```
   POST http://localhost:3000/api/auth/login
   Body: { "studentCode": "teacher-001", "password": "..." }
   ```
   Save the returned JWT token as `TEACHER_TOKEN`

2. **Prepare Video Upload**
   ```
   POST http://localhost:3000/api/lessons/lesson-1/video
   Headers: Authorization: Bearer TEACHER_TOKEN
   Body: { "title": "Chapter 1 - Test Video" }
   ```
   Expected: 201 response with `uploadUrl` and `videoId`
   Save the `videoId` for later

3. **Upload Video File**
   ```
   PUT {uploadUrl from step 2}
   Headers: AccessKey: {BUNNY_API_KEY}
   Body: (raw video file bytes)
   ```
   Expected: 200/201 from Bunny (video begins processing)

4. **Poll Status (Immediate)**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/video-status
   Headers: Authorization: Bearer TEACHER_TOKEN
   ```
   Expected: `status: 2 or 3, encodeProgress: <number>, ready: false`
   (Video is processing)

5. **Login as Student**
   ```
   POST http://localhost:3000/api/auth/login
   Body: { "studentCode": "student-001", "password": "..." }
   ```
   Save as `STUDENT_TOKEN`

6. **Student Tries to Get Video URL (While Processing)**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/video-url
   Headers: Authorization: Bearer STUDENT_TOKEN
   ```
   Expected: **404** with message "لم يتم رفع فيديو لهذا الدرس بعد."
   ✅ **Critical:** Student does NOT see "processing" message - video appears non-existent

7. **Poll Status Multiple Times (Every 10-30 seconds)**
   Keep calling the status endpoint above until `ready: true`
   (Actual encoding time depends on file size; typically 5-15 minutes for most videos)

8. **Once Video is Ready (status: 4, ready: true)**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/video-url
   Headers: Authorization: Bearer STUDENT_TOKEN
   ```
   Expected: **200** with `playbackUrl` (signed iframe URL)
   ✅ **Critical:** Student can now access the video

9. **Student Gets Video List**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/videos
   Headers: Authorization: Bearer STUDENT_TOKEN
   ```
   Expected: **200** with `videos: [{videoId, ready: true, playbackUrl, ...}]`
   ✅ **Critical:** Video appears in the list with ready status

### Success Criteria:
- [ ] Step 2: Upload prep succeeds (201)
- [ ] Step 3: File uploads to Bunny (200/201)
- [ ] Step 4: Status shows processing (status < 4)
- [ ] Step 6: Student gets 404 while processing (NOT "processing" message)
- [ ] Step 8: Once ready, student can get playback URL (200)
- [ ] Step 9: Video appears in ready list

---

## Test 2: Processing Video Hidden from Students

**Objective:** Verify that while a video is still processing, students see it as non-existent.

### Preconditions:
- Have a video currently in processing state (status 2 or 3)
- Use the videoId from Test 1

### Steps:

1. **Verify Video is Processing (Teacher View)**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/video-status
   Headers: Authorization: Bearer TEACHER_TOKEN
   ```
   Expected: `status: 2 or 3` (NOT 4)

2. **Try to Get Playback URL (Student)**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/video-url
   Headers: Authorization: Bearer STUDENT_TOKEN
   ```
   Expected: **404** "لم يتم رفع فيديو لهذا الدرس بعد."

3. **Get Video List (Student)**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/videos
   Headers: Authorization: Bearer STUDENT_TOKEN
   ```
   Expected: **200** with `videos: []` (empty list - no processing videos shown)

4. **Check Teacher Management View**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/videos
   Headers: Authorization: Bearer TEACHER_TOKEN
   ```
   Expected: **200** with the video listed, showing `ready: false, status: 2 or 3`
   ✅ **Critical:** Teacher STILL sees processing video in management

### Success Criteria:
- [ ] Student gets 404 (not "processing" message)
- [ ] Student's video list is empty
- [ ] Teacher's video list shows the processing video with status < 4

---

## Test 3: Failure Detection, Notification, and Cleanup

**Objective:** Test automatic failure handling when video encoding fails.

### Approach:
Since real Bunny failure is unpredictable, we'll simulate it by:
1. Creating a video via the platform
2. Manually setting its status to "failed" in Bunny (if possible), OR
3. Testing the failure handler logic directly

### Option A: Direct Logic Test (Easiest)

**Test the failure handler without needing a real failed video:**

```bash
# Create a test file to simulate failure handling
node << 'EOF'
const { checkAndHandleVideoStatus } = require('./src/services/video-monitoring.service');

// Mock a failed video scenario
// (In production, this would be called when Bunny reports status 5 or 6)
checkAndHandleVideoStatus(
  "mock-failed-video-123",
  "lesson-1",
  "teacher-001"
).then(result => {
  console.log("Failure handler result:", result);
  if (result.action === 'failure_cleanup') {
    console.log("✓ Failure cleanup triggered");
    console.log("  - Notification:", result.results.notification);
    console.log("  - Bunny delete:", result.results.bunny_delete);
    console.log("  - DB clear:", result.results.db_clear);
  }
});
EOF
```

### Option B: Simulate with Corrupted File (Real Test)

If you want to trigger a real failure:

1. **Upload a Corrupted File**
   - Create an invalid/corrupted video file (e.g., empty file, wrong format)
   - Upload it via the normal flow (Test 1, steps 2-3)
   - Bunny will fail to encode it

2. **Wait for Failure Detection**
   - Background monitoring checks every 30 seconds
   - When Bunny marks it as failed (status 5 or 6), handler triggers automatically
   - Check server logs for: `[video-monitoring] Video ... failed with status 5`

3. **Verify Teacher Notification**
   ```
   GET http://localhost:3000/api/notifications
   Headers: Authorization: Bearer TEACHER_TOKEN
   ```
   Expected: New notification with:
   - `type: "video_failed"`
   - `title: "❌ فشل رفع الفيديو"`
   - Message mentioning the video name and lesson
   - `link: "/dashboard-teacher.html?tab=manage-videos&lesson=lesson-1"`

4. **Verify Video is Deleted from Bunny**
   - Check Bunny dashboard manually
   - The failed video should no longer appear in the library

5. **Verify DB Reference is Cleared**
   - Query: `SELECT videoId FROM lessons WHERE id = 'lesson-1';`
   - Expected: `NULL` or no row

6. **Student Tries to Access**
   ```
   GET http://localhost:3000/api/lessons/lesson-1/video-url
   Headers: Authorization: Bearer STUDENT_TOKEN
   ```
   Expected: **404** "لم يتم رفع فيديو لهذا الدرس بعد."
   (Student never knew it existed)

### Success Criteria:
- [ ] Teacher receives notification about failure
- [ ] Failed video is removed from Bunny
- [ ] Database reference is cleared
- [ ] Student never sees the failed video

---

## Test 4: Edge Cases

### 4a. Enrollment Check Still Works
- Student NOT enrolled in course should get 403 on both:
  - `GET /api/lessons/{lessonId}/video-url`
  - `GET /api/lessons/{lessonId}/videos`

### 4b. Non-Existent Lesson
- Access video for non-existent lesson should return 404

### 4c. Multiple Videos in One Lesson
- Upload 2-3 videos for the same lesson
- Verify:
  - Only ready videos appear to students
  - All videos appear to teacher
  - If one fails, others unaffected

### 4d. Concurrent Monitoring
- Upload multiple videos rapidly
- Verify monitoring handles all without interference
- Check server logs for `[video-monitoring]` messages

---

## Monitoring & Debugging

### Server Logs to Watch

**Normal upload starting:**
```
[video.routes] Upload prep succeeded for lesson lesson-1
[video-monitoring] Monitoring started for videoId: ...
```

**Video processing:**
```
[video-monitoring] Video ... status: 2 (progress: 45%)
[video-monitoring] Video ... status: 2 (progress: 87%)
```

**Video ready:**
```
[video-monitoring] Monitor stopping for ... action: ready
```

**Video failed (CRITICAL):**
```
[video-monitoring] Video ... failed with status 5
[video-monitoring] Notified teacher ... about video failure
[video-monitoring] Deleted failed video ... from Bunny
[video-monitoring] Cleared video reference for lesson ...
```

### API Testing Tools
- **cURL** (PowerShell-compatible):
  ```powershell
  curl.exe -X GET "http://localhost:3000/api/lessons/lesson-1/video-url" `
    -H "Authorization: Bearer $STUDENT_TOKEN"
  ```

- **Postman** or **REST Client** VSCode extension
- **Node.js**: Use `node-fetch` or `axios`

---

## Rollback / Troubleshooting

### If Videos are Hidden Unexpectedly
Check:
1. Video status in Bunny dashboard (should be 4 for ready)
2. Server logs for any error messages
3. Verify `GET /api/lessons/:lessonId/video-status` returns status: 4

### If Teacher Doesn't Get Notification
Check:
1. Teacher user ID is correct
2. Database notifications table has entries
3. Server logs for `[notifications]` errors
4. Teacher's user role is "TEACHER" in DB

### If Failed Video Not Deleted from Bunny
Check:
1. Bunny API key has delete permissions
2. Video was actually marked as failed (status 5 or 6)
3. Server logs for `[video-monitoring] Deleted failed video`

---

## Final Checklist

Before signing off on this feature:

- [ ] Test 1: Normal upload flow works unchanged
- [ ] Test 2: Processing video hidden from students (visible to teacher)
- [ ] Test 3: Failure triggers notification + cleanup
- [ ] Test 4a: Enrollment checks still enforced
- [ ] Test 4b: Non-existent lessons handled properly
- [ ] Test 4c: Multiple videos per lesson work correctly
- [ ] All three requirements from spec are verified:
  - [ ] Students never see processing/failed videos
  - [ ] Teacher gets notification on failure
  - [ ] Failed video auto-deleted from Bunny and DB

---

## Notes for Developers

### How Monitoring Works
1. After POST upload, `startVideoStatusMonitoring()` begins in background
2. Every 30 seconds, it calls `checkAndHandleVideoStatus()`
3. If status becomes 4 (ready), monitoring stops
4. If status becomes 5 or 6 (failed), it:
   - Calls `handleVideoFailure()`
   - Sends teacher notification
   - Deletes from Bunny
   - Clears DB reference
   - Monitoring stops
5. If neither ready nor failed after 24 hours, monitoring times out

### Future Improvements
- Replace lesson.stub.service.js with real Prisma `lessons` table
- Add webhook support (instead of polling) when Bunny notifies us
- Queue long-running tasks to a job server (Bull/BullMQ)
- Add retry logic for failed cleanup operations
- Monitor for videos that get stuck (>24h processing)
