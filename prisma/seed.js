const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  const teacherCode = process.env.TEACHER_CODE;
  const teacherName = process.env.TEACHER_NAME || 'Ms. Asmaa';
  const teacherPassword = process.env.TEACHER_PASSWORD;

  // Validate required environment variables
  if (!teacherCode || !teacherPassword) {
    console.error(
      '\n[Seed Error] Missing required environment variables.\n' +
      'Please ensure TEACHER_CODE and TEACHER_PASSWORD are set in your .env file or environment.\n'
    );
    process.exit(1);
  }

  console.log('[Seed] Initializing single teacher account...');

  // Hash the teacher password securely using bcrypt
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(teacherPassword, salt);

  // Check if a teacher account or this studentCode already exists
  const existingTeacher = await prisma.user.findFirst({
    where: {
      OR: [
        { studentCode: teacherCode.trim() },
        { role: 'TEACHER' },
      ],
    },
  });

  let teacher;
  if (existingTeacher) {
    teacher = await prisma.user.update({
      where: { id: existingTeacher.id },
      data: {
        studentCode: teacherCode.trim(),
        name: teacherName.trim(),
        password: hashedPassword,
        role: 'TEACHER',
        status: 'APPROVED',
      },
      select: {
        id: true,
        studentCode: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.log(`[Seed] Existing teacher account updated successfully: ${teacher.name} (${teacher.studentCode})`);
  } else {
    teacher = await prisma.user.create({
      data: {
        studentCode: teacherCode.trim(),
        name: teacherName.trim(),
        password: hashedPassword,
        role: 'TEACHER',
        status: 'APPROVED',
      },
      select: {
        id: true,
        studentCode: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.log(`[Seed] Teacher account created successfully: ${teacher.name} (${teacher.studentCode})`);
  }

  console.log('[Seed] Verification:');
  console.log(` - Role: ${teacher.role}`);
  console.log(` - Status: ${teacher.status}`);
  console.log(` - StudentCode: ${teacher.studentCode}`);
  console.log(' - Password: [SECURELY HASHED]');
}

main()
  .catch((e) => {
    console.error('[Seed Fatal Error]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
