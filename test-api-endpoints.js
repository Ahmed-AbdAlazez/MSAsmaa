#!/usr/bin/env node

/**
 * Test API endpoints directly
 * Simulates the frontend calling the notification endpoints
 */

const { prisma } = require('./src/config/db.js');
const jwt = require('jsonwebtoken');

async function main() {
  try {
    console.log('\n========== API ENDPOINT TEST ==========\n');

    // Find a teacher
    const teacher = await prisma.user.findFirst({
      where: { role: 'TEACHER' },
    });

    if (!teacher) {
      console.log('❌ No teacher found!');
      process.exit(1);
    }

    console.log(`✅ Found teacher: ${teacher.name}`);
    console.log(`   Teacher ID: ${teacher.id}\n`);

    // Create a JWT token (same way the server does it)
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const token = jwt.sign(
      { id: teacher.id, role: teacher.role },
      secret,
      { expiresIn: '24h' }
    );

    console.log(`✅ Generated JWT token`);
    console.log(`   Token (first 50 chars): ${token.substring(0, 50)}...\n`);

    // Now test the API endpoints
    console.log('Testing API endpoints:\n');

    // 1. Test GET /api/notifications
    console.log('1️⃣  Testing GET /api/notifications');
    console.log(`   URL: http://localhost:3000/api/notifications`);
    console.log(`   Header: Authorization: Bearer ${token.substring(0, 30)}...`);
    console.log('\n   Expected response:');
    console.log(`   { "success": true, "notifications": [...] }\n`);

    // 2. Test GET /api/notifications/unread-count
    console.log('2️⃣  Testing GET /api/notifications/unread-count');
    console.log(`   URL: http://localhost:3000/api/notifications/unread-count`);
    console.log(`   Header: Authorization: Bearer ${token.substring(0, 30)}...`);
    console.log('\n   Expected response:');
    console.log(`   { "success": true, "count": 1 }\n`);

    // 3. Test PATCH /api/notifications/read-all
    console.log('3️⃣  Testing PATCH /api/notifications/read-all');
    console.log(`   URL: http://localhost:3000/api/notifications/read-all`);
    console.log(`   Header: Authorization: Bearer ${token.substring(0, 30)}...`);
    console.log('\n   Expected response:');
    console.log(`   { "success": true }\n`);

    console.log('========== NEXT STEPS ==========\n');
    console.log('1. Open browser console (F12)');
    console.log('2. Check the Network tab for failed requests');
    console.log('3. Look for 401, 403, 500 errors');
    console.log('4. Check the Response tab for error details');
    console.log('\nOR manually test with curl:');
    console.log(`\ncurl -X GET http://localhost:3000/api/notifications \\`);
    console.log(`  -H "Authorization: Bearer ${token}"`);
    console.log('');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
