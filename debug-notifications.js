#!/usr/bin/env node

/**
 * Debug script to test the notification flow
 * Run: node debug-notifications.js
 */

const { prisma } = require('./src/config/db.js');
const {
  createNotificationForTeacher,
  getNotificationsForUser,
  getUnreadCount,
} = require('./src/services/notifications.service.js');

async function main() {
  try {
    console.log('\n========== NOTIFICATION DEBUG ==========\n');

    // 1. List all teachers
    console.log('1️⃣  FINDING TEACHERS...');
    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      select: { id: true, name: true, email: true },
      take: 5,
    });
    console.log(`Found ${teachers.length} teacher(s):`);
    teachers.forEach(t => console.log(`   - ${t.name} (ID: ${t.id})`));

    if (!teachers.length) {
      console.log('\n❌ No teachers found in database!');
      console.log('   Create a teacher account first by logging in as signup.\n');
      process.exit(1);
    }

    const teacherId = teachers[0].id;
    const teacherName = teachers[0].name;

    // 2. Create a test notification
    console.log(`\n2️⃣  CREATING TEST NOTIFICATION FOR ${teacherName}...`);
    const newNotif = await createNotificationForTeacher(teacherId, {
      type: 'video_success',
      title: '✅ تم رفع الفيديو بنجاح',
      message: 'فيديو تجريبي تم رفعه بنجاح',
      link: '/dashboard-teacher.html',
    });
    console.log(`   Created notification: ID=${newNotif.id}`);

    // 3. Fetch notifications for this teacher
    console.log(`\n3️⃣  FETCHING NOTIFICATIONS FOR ${teacherName}...`);
    const notifs = await getNotificationsForUser(teacherId);
    console.log(`   Found ${notifs.length} notification(s):`);
    notifs.slice(0, 5).forEach(n => {
      console.log(`   - ${n.title} (isRead: ${n.isRead})`);
    });

    // 4. Get unread count
    console.log(`\n4️⃣  CHECKING UNREAD COUNT...`);
    const unreadCount = await getUnreadCount(teacherId);
    console.log(`   Unread count: ${unreadCount}`);

    // 5. Summary
    console.log('\n========== SUMMARY ==========');
    console.log('✅ Database connection: OK');
    console.log('✅ Notifications service: OK');
    console.log('✅ Teacher found: ' + teacherName);
    console.log('✅ Can create notifications: YES');
    console.log('✅ Can fetch notifications: YES');
    console.log('\n💡 TIP: API endpoints should work if database tests pass.');
    console.log('   If notifications still don\'t show in UI:');
    console.log('   1. Check browser console for JavaScript errors');
    console.log('   2. Check if teacher is logged in (localStorage.token)');
    console.log('   3. Verify Authorization header is being sent\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.code === 'P1000') {
      console.error('Database connection failed. Is PostgreSQL running?');
    }
    process.exit(1);
  }
}

main();
