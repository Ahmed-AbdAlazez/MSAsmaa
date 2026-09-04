/**
 * scripts/test-live-streaming.js
 * ---------------------------------------------------------------------------
 * Automated verification test script for Live Streaming Feature (Zoom & Google Meet).
 * Runs against Prisma database and service methods.
 */

const { prisma } = require("../src/config/db");
const jwt = require("jsonwebtoken");
const {
  createLiveSession,
  getActiveLiveSession,
  endLiveSession,
  generateJoinToken,
  validateTokenAndGetEmbed,
} = require("../src/services/live-session.service");

async function runTests() {
  console.log("\n=======================================================");
  console.log("🧪 STARTING LIVE STREAMING FEATURE INTEGRATION TESTS");
  console.log("=======================================================\n");

  try {
    // 0. Setup test users
    console.log("0️⃣  Fetching or creating test accounts...");

    let teacher = await prisma.user.findFirst({ where: { role: "TEACHER" } });
    if (!teacher) {
      teacher = await prisma.user.create({
        data: {
          studentCode: "T-TEST-01",
          name: "أ. أسماء مرسال (اختبار)",
          password: "password123",
          email: "teacher-test@example.com",
          role: "TEACHER",
          status: "APPROVED",
        },
      });
    }

    let approvedStudent = await prisma.user.findFirst({
      where: { role: "STUDENT", status: "APPROVED" },
    });
    if (!approvedStudent) {
      approvedStudent = await prisma.user.create({
        data: {
          studentCode: "S-APP-01",
          name: "طالب مسجل (اختبار)",
          password: "password123",
          email: "approved-student@example.com",
          role: "STUDENT",
          status: "APPROVED",
        },
      });
    }

    let unapprovedStudent = await prisma.user.findFirst({
      where: { role: "STUDENT", status: "PENDING" },
    });
    if (!unapprovedStudent) {
      unapprovedStudent = await prisma.user.create({
        data: {
          studentCode: "S-PEN-01",
          name: "طالب غير مسجل (اختبار)",
          password: "password123",
          email: "unapproved-student@example.com",
          role: "STUDENT",
          status: "PENDING",
        },
      });
    }

    console.log(`   ✅ Teacher: ${teacher.name} (${teacher.id})`);
    console.log(`   ✅ Approved Student: ${approvedStudent.name} (${approvedStudent.id})`);
    console.log(`   ✅ Unapproved Student: ${unapprovedStudent.name} (${unapprovedStudent.id})\n`);

    // TEST 1: Teacher starts Google Meet session
    console.log("1️⃣  TEST: Teacher starts Google Meet session");
    const googleMeetSession = await createLiveSession({
      teacherId: teacher.id,
      title: "بث مباشر أحياء - Google Meet",
      provider: "google_meet",
    });

    console.log(`   ✅ Created session ID: ${googleMeetSession.id}`);
    console.log(`   ✅ Provider: ${googleMeetSession.provider}`);
    console.log(`   ✅ Status: ${googleMeetSession.status}`);

    const activeMeet = await getActiveLiveSession();
    if (!activeMeet || activeMeet.id !== googleMeetSession.id) {
      throw new Error("❌ Active session query failed for Google Meet");
    }
    console.log("   ✅ Verified active session in DB\n");

    // TEST 2: Enrolled student generates token & joins Google Meet stream embedded
    console.log("2️⃣  TEST: Approved student joins Google Meet stream");
    const googleTokenResult = await generateJoinToken({
      studentId: approvedStudent.id,
      sessionId: googleMeetSession.id,
    });

    if (!googleTokenResult.token || !googleTokenResult.redirectUrl.startsWith("/live-session.html?token=")) {
      throw new Error("❌ Join token generation failed or exposed raw link");
    }
    console.log(`   ✅ Short-lived token generated: ${googleTokenResult.token.substring(0, 16)}...`);
    console.log(`   ✅ Platform redirect URL returned: ${googleTokenResult.redirectUrl}`);

    const googleEmbedInfo = await validateTokenAndGetEmbed({
      token: googleTokenResult.token,
      studentId: approvedStudent.id,
    });

    if (googleEmbedInfo.provider !== "google_meet" || !googleEmbedInfo.embedUrl) {
      throw new Error("❌ Embed info validation failed for Google Meet");
    }
    console.log(`   ✅ Validated embed info. Title: "${googleEmbedInfo.title}", Provider: ${googleEmbedInfo.provider}`);
    console.log(`   ✅ Embed URL correctly retrieved for player container\n`);

    // TEST 3: Teacher starts Zoom session with custom allowCamera choice
    console.log("3️⃣  TEST: Teacher starts Zoom session (allowCamera = true)");
    const zoomSession = await createLiveSession({
      teacherId: teacher.id,
      title: "بث مباشر أحياء - Zoom",
      provider: "zoom",
      allowCamera: true,
    });

    console.log(`   ✅ Created session ID: ${zoomSession.id}`);
    console.log(`   ✅ Provider: ${zoomSession.provider}`);

    const activeZoom = await getActiveLiveSession();
    if (!activeZoom || activeZoom.id !== zoomSession.id) {
      throw new Error("❌ Active session query failed for Zoom");
    }
    console.log("   ✅ Previous Google Meet session closed and Zoom session active\n");

    // TEST 4: Enrolled student joins Zoom session
    console.log("4️⃣  TEST: Approved student joins Zoom session and receives allowCamera = true");
    const zoomTokenResult = await generateJoinToken({
      studentId: approvedStudent.id,
      sessionId: zoomSession.id,
    });

    const zoomEmbedInfo = await validateTokenAndGetEmbed({
      token: zoomTokenResult.token,
      studentId: approvedStudent.id,
    });

    if (zoomEmbedInfo.provider !== "zoom" || !zoomEmbedInfo.embedUrl || zoomEmbedInfo.allowCamera !== true) {
      throw new Error("❌ Embed info validation failed for Zoom or allowCamera flag mismatch");
    }
    console.log(`   ✅ Validated Zoom embed info. Title: "${zoomEmbedInfo.title}", Provider: ${zoomEmbedInfo.provider}, AllowCamera: ${zoomEmbedInfo.allowCamera}`);
    console.log(`   ✅ Zoom embed URL configured for player: ${zoomEmbedInfo.embedUrl}\n`);

    // TEST 5: Unenrolled / Unapproved student access is REJECTED
    console.log("5️⃣  TEST: Unapproved / Pending student access rejection");
    try {
      await generateJoinToken({
        studentId: unapprovedStudent.id,
        sessionId: zoomSession.id,
      });
      throw new Error("❌ Access check failed! Unapproved student was wrongly granted a token.");
    } catch (err) {
      if (err.statusCode === 403) {
        console.log(`   ✅ Successfully REJECTED unapproved student with 403: "${err.message}"`);
      } else {
        throw err;
      }
    }

    try {
      await validateTokenAndGetEmbed({
        token: zoomTokenResult.token,
        studentId: unapprovedStudent.id,
      });
      throw new Error("❌ Embed validation failed! Unapproved student validated token meant for another student.");
    } catch (err) {
      if (err.statusCode === 403) {
        console.log(`   ✅ Successfully REJECTED token validation for wrong/unapproved student: "${err.message}"\n`);
      } else {
        throw err;
      }
    }

    // TEST 6: Token expiration & invalid token rejection
    console.log("6️⃣  TEST: Expired / Invalid token rejection");
    try {
      await validateTokenAndGetEmbed({
        token: "invalid-dummy-token-12345",
        studentId: approvedStudent.id,
      });
      throw new Error("❌ Failed to reject invalid token.");
    } catch (err) {
      if (err.statusCode === 403) {
        console.log(`   ✅ Successfully rejected invalid token: "${err.message}"`);
      } else {
        throw err;
      }
    }

    // Cleanup active test sessions
    await endLiveSession(zoomSession.id, teacher.id);
    console.log("\n=======================================================");
    console.log("🎉 ALL LIVE STREAMING INTEGRATION TESTS PASSED SUCCESSFULLY!");
    console.log("=======================================================\n");

  } catch (error) {
    console.error("\n❌ INTEGRATION TEST FAILED:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
