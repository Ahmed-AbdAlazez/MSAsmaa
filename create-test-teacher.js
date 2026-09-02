#!/usr/bin/env node

/**
 * Create a test teacher account and show login credentials
 */

const { prisma } = require('./src/config/db.js');
const bcrypt = require('bcrypt');

async function main() {
  try {
    // Check if teacher exists
    let teacher = await prisma.user.findFirst({
      where: { role: 'TEACHER' },
    });

    if (!teacher) {
      console.log('Creating new teacher account...');
      const hashedPassword = await bcrypt.hash('Test@1234', 10);
      teacher = await prisma.user.create({
        data: {
          studentCode: 'TEACHER001',
          name: 'Ms. Teacher Test',
          email: 'teacher@test.com',
          password: hashedPassword,
          role: 'TEACHER',
          status: 'APPROVED',
        },
      });
    }

    console.log('\n✅ TEACHER ACCOUNT CREDENTIALS\n');
    console.log('Student Code (كود الدخول):', teacher.studentCode);
    console.log('Password (كلمة المرور): Test@1234');
    console.log('Name:', teacher.name);
    console.log('Email:', teacher.email);
    console.log('\nThese credentials can be used to log in at: http://localhost:5173/login');

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
