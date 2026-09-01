# Video Upload Failure Handling Implementation - Summary

## Overview
This implementation adds three critical behaviors for Bunny Stream video processing to ensure students only see ready videos, teachers are notified of failures, and failed content is automatically cleaned up.

---

## What Was Implemented

### 1. ✅ Students Never See Unready Videos
**Location:** `src/routes/video.routes.js`

- Modified `GET /api/lessons/:lessonId/video-url` to check video status before returning playback URL
- Modified `GET /api/lessons/:lessonId/videos` to filter out videos where `status !== 4`
- Students get HTTP 404 "لم يتم رفع فيديو لهذا الدرس بعد" for processing/failed videos
- Bunny status codes: 0-3 = processing, 4 = ready, 5-6 = failed
- Result: Students see no broken player, no "processing" message - just "video doesn't exist yet"

**Code changes:**
```javascript
// In GET /api/lessons/:lessonId/video-url
const videoMetadata = await getVideo(lessonVideoId);
if (!videoMetadata || videoMetadata.status !== 4) {
  return res.status(404).json({ error: "لم يتم رفع فيديو لهذا الدرس بعد." });
}

// In GET /api/lessons/:lessonId/videos
const readyVideos = items.filter((video) => video.status === 4);
```

**Teacher view unaffected:** Teachers still see all videos (processing/failed/ready) in management dashboard for visibility and manual control.

---

### 2. ✅ Teacher Notified of Video Failure
**Location:** `src/services/notifications.service.js` + `src/services/video-monitoring.service.js`

- New function: `createNotificationForTeacher(teacherId, options)`
- Extends existing notification system (no separate system built)
- Sends Arabic message: "❌ فشل رفع الفيديو" with:
  - Video name
  - Lesson name
  - Direct link to lesson management page
  - Encouragement to re-upload

**Code added:**
```javascript
async function createNotificationForTeacher(teacherId, {
  type,        // "video_failed"
  title,       // "❌ فشل رفع الفيديو"
  message,     // "فشل رفع الفيديو ... الخاص بدرس ..."
  relatedId,   // lessonId
  relatedType, // "lesson"
  link,        // Link to management dashboard
}) { ... }
```

---

### 3. ✅ Automatic Cleanup of Failed Videos
**Location:** `src/services/video-monitoring.service.js` (NEW FILE)

Implements background monitoring that:
1. Polls video status every 30 seconds after upload
2. When failure detected (status 5 or 6):
   - Notifies teacher
   - Deletes video from Bunny (via API)
   - Clears database reference
   - Stops monitoring
3. Timeout: stops monitoring after 24 hours

**Key functions:**
- `startVideoStatusMonitoring(videoId, lessonId, teacherId, options)` - Starts background job
- `checkAndHandleVideoStatus(videoId, lessonId, teacherId)` - Single status check
- `handleVideoFailure(videoId, lessonId, teacherId, video)` - Triggers cleanup
- `pollVideoStatus(videoId)` - Used by client UI during upload

**Integration in upload flow:**
```javascript
// In POST /api/lessons/:lessonId/video (after upload prep)
startVideoStatusMonitoring(bunnyVideoId, lessonId, req.user.id, {
  pollIntervalMs: 30000,              // Every 30 seconds
  maxDurationMs: 24 * 60 * 60 * 1000, // Max 24 hours
});
```

---

## Files Changed

| File | Changes |
|------|---------|
| `src/routes/video.routes.js` | Added status filtering to student endpoints; integrated monitoring startup |
| `src/services/notifications.service.js` | Added `createNotificationForTeacher()` function |
| `src/services/video-monitoring.service.js` | **NEW** - Background monitoring and failure handling |

---

## Safety Guarantees

✅ **Normal uploads unaffected** - Successful uploads work exactly as before
✅ **No false positives** - Only acts on confirmed failures (status 5 or 6), not intermediate states
✅ **Reasonable timeout** - Stops monitoring after 24 hours (videos shouldn't take that long)
✅ **Teacher control preserved** - Teachers see all videos and can manually manage
✅ **No data loss** - Failure cleanup only happens after teacher is notified
✅ **Graceful fallback** - If cleanup partially fails, logs show which parts succeeded/failed

---

## Testing Instructions

See `VIDEO_FAILURE_HANDLING_TEST_GUIDE.md` for comprehensive test procedures covering:

1. **Test 1:** Normal upload flow (verification that nothing broke)
2. **Test 2:** Processing video hidden from students (verification)
3. **Test 3:** Failure detection, notification, and cleanup (main feature)
4. **Test 4:** Edge cases (enrollment, multiple videos, etc.)

Quick test:
```bash
# Verify modules load
node -e "require('./src/services/video-monitoring.service.js'); console.log('OK')"

# Start server (requires DB connection)
node src/server.js
```

---

## Architecture Notes

### Video Status Lifecycle
```
Student uploads → Bunny reserves slot (status 0)
                → Browser PUTs file to Bunny (status 1)
                → Bunny processes (status 2-3)
                ├→ Encoding succeeds → status 4 (READY)
                │  └→ Student can watch
                └→ Encoding fails → status 5/6 (FAILED)
                   └→ Auto-cleanup triggered
                   └→ Teacher notified
                   └→ Video deleted
                   └→ Lesson shows "no video"
```

### Monitoring Implementation
- **Polling over Webhooks:** Currently uses polling for simplicity (no webhook infrastructure needed)
- **Future improvement:** Could switch to Bunny webhooks for instant detection
- **Background job:** Uses `setInterval` loop; for scaling, would use Bull/BullMQ
- **No persistence:** If server restarts, monitoring stops (trade-off for simplicity)

### Database Readiness
- Uses existing `Notification` table (no schema changes needed)
- Uses stub `lesson.stub.service.js` for lesson→video mapping
- When real `lessons` table added: only edit stub file, routes/services unchanged

---

## Deployment Checklist

Before deploying to production:

- [ ] Build succeeds: `npm run build`
- [ ] Tests pass: See `VIDEO_FAILURE_HANDLING_TEST_GUIDE.md`
- [ ] Bunny API key has permissions:
  - Delete videos (for cleanup)
  - Query video status (for polling)
- [ ] Database notifications table has capacity (will create 1 per teacher per failure)
- [ ] Consider webhook setup (future optimization) to replace polling
- [ ] Document that failed videos are auto-deleted (inform teachers)
- [ ] Test with real Bunny account (test environment first)

---

## Support & Maintenance

### Monitoring Failed Videos
Watch server logs for `[video-monitoring]` messages:
```
[video-monitoring] Video abc123 failed with status 5
[video-monitoring] Notified teacher user-1 about video abc123 failure
[video-monitoring] Deleted failed video abc123 from Bunny
[video-monitoring] Cleared video reference for lesson lesson-1
```

### Troubleshooting
- **Videos stuck processing 24h+?** → Check Bunny dashboard, may need manual action
- **Teacher didn't get notified?** → Check server logs and notifications table in DB
- **Failed video not deleted from Bunny?** → Check API key permissions and logs

### Future Improvements
1. Add webhook support for instant failure detection
2. Migrate to job queue (Bull/BullMQ) for reliability
3. Add retry logic for cleanup operations
4. Implement alerts for monitoring failures
5. Add metrics/monitoring dashboard for upload health

---

## Questions?
Refer to:
- Implementation details: Code comments in `src/services/video-monitoring.service.js`
- Testing procedures: `VIDEO_FAILURE_HANDLING_TEST_GUIDE.md`
- Video integration context: `VIDEO_INTEGRATION_README.md`
