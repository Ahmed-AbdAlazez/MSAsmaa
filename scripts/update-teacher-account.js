/*
 * Temporary interactive administrator utility.
 *
 * Updates exactly one existing TEACHER record. It never deletes users and
 * never creates users. Delete this file after the administrative update.
 */
require('dotenv').config();

const readline = require('node:readline');
const { prisma } = require('../src/config/db');
const { hashPassword, comparePassword } = require('../src/utils/password');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isStrongPassword = (value) =>
  /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

const safeTeacherSelect = {
  id: true,
  studentCode: true,
  email: true,
  role: true,
  status: true,
};

function createPrompt() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(prompt, rl) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function askSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('A TTY terminal is required for hidden password entry.'));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    const output = process.stdout;

    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
    };
    const onData = (chunk) => {
      const key = chunk.toString('utf8');
      if (key === '\u0003') {
        cleanup();
        output.write('\n');
        reject(new Error('Cancelled.'));
      } else if (key === '\r' || key === '\n') {
        cleanup();
        output.write('\n');
        resolve(value);
      } else if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
      } else if (!key.startsWith('\u001b')) {
        value += key;
      }
    };

    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

function printTeacher(teacher) {
  console.log(`Student Code: ${teacher.studentCode}`);
  console.log(`Email: ${teacher.email || '[none]'}`);
  console.log(`Role: ${teacher.role}`);
  console.log(`Status: ${teacher.status}`);
}

async function selectTeacher(rl) {
  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER' },
    select: safeTeacherSelect,
    orderBy: { createdAt: 'asc' },
  });

  if (teachers.length === 0) {
    console.log('No TEACHER account found.');
    return null;
  }

  if (teachers.length === 1) return teachers[0];

  console.log('Multiple TEACHER accounts found. Choose one by id:');
  for (const teacher of teachers) {
    console.log({
      id: teacher.id,
      studentCode: teacher.studentCode,
      email: teacher.email,
      role: teacher.role,
      status: teacher.status,
    });
  }

  const selectedId = (await ask('Enter Teacher id to update: ', rl)).trim();
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedId);
  if (!selectedTeacher) {
    console.log('No listed TEACHER account matches that id.');
    return null;
  }
  return selectedTeacher;
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Run this script from an interactive terminal.');
  }

  const rl = createPrompt();
  try {
    const teacher = await selectTeacher(rl);
    if (!teacher) return;

    if (teacher.role !== 'TEACHER' || teacher.status !== 'APPROVED') {
      console.log('Selected account is not an approved TEACHER. No changes were made.');
      return;
    }

    console.log('\nTeacher account found:\n');
    printTeacher(teacher);

    const studentCode = (await ask('\nEnter new Teacher Student Code: ', rl)).trim();
    const email = (await ask('Enter new Teacher Gmail: ', rl)).trim().toLowerCase();
    rl.close();

    const password = await askSecret('Enter new Teacher Password: ');
    const confirmPassword = await askSecret('Confirm new Teacher Password: ');

    if (!studentCode) {
      console.log('Teacher Student Code cannot be empty. No changes were made.');
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      console.log('Enter a valid Gmail/email address. No changes were made.');
      return;
    }
    if (!isStrongPassword(password)) {
      console.log('Password must include uppercase, lowercase, and a number. No changes were made.');
      return;
    }
    if (password !== confirmPassword) {
      console.log('Passwords do not match. No changes were made.');
      return;
    }

    const [codeInUse, emailInUse] = await Promise.all([
      prisma.user.findFirst({ where: { studentCode, NOT: { id: teacher.id } }, select: { id: true } }),
      prisma.user.findFirst({ where: { email, NOT: { id: teacher.id } }, select: { id: true } }),
    ]);
    if (codeInUse) {
      console.log('This Student Code is already in use.');
      return;
    }
    if (emailInUse) {
      console.log('This email is already in use.');
      return;
    }

    console.log('\nThe following changes will be made:\n');
    console.log(`Student Code: ${teacher.studentCode} → ${studentCode}`);
    console.log(`Email: ${teacher.email || '[none]'} → ${email}`);
    console.log('Password: [CHANGED]');

    const confirmationRl = createPrompt();
    const confirmation = (await ask('Continue? (y/N) ', confirmationRl)).trim().toLowerCase();
    confirmationRl.close();
    if (confirmation !== 'y') {
      console.log('Cancelled. No changes were made.');
      return;
    }

    const hashedPassword = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      const [currentCodeInUse, currentEmailInUse] = await Promise.all([
        tx.user.findFirst({ where: { studentCode, NOT: { id: teacher.id } }, select: { id: true } }),
        tx.user.findFirst({ where: { email, NOT: { id: teacher.id } }, select: { id: true } }),
      ]);
      if (currentCodeInUse) throw new Error('This Student Code is already in use.');
      if (currentEmailInUse) throw new Error('This email is already in use.');

      return tx.user.update({
        where: { id: teacher.id },
        data: { studentCode, email, password: hashedPassword },
        select: { ...safeTeacherSelect, password: true },
      });
    });

    const updatedTeacher = await prisma.user.findUnique({
      where: { id: teacher.id },
      select: { ...safeTeacherSelect, password: true },
    });
    const passwordVerified = Boolean(
      updatedTeacher && await comparePassword(password, updatedTeacher.password)
    );
    if (
      !updatedTeacher ||
      updatedTeacher.studentCode !== studentCode ||
      updatedTeacher.email !== email ||
      updatedTeacher.role !== 'TEACHER' ||
      updatedTeacher.status !== 'APPROVED' ||
      !passwordVerified
    ) {
      throw new Error('Post-update verification failed.');
    }

    console.log('\nTeacher account updated successfully.\n');
    printTeacher(updatedTeacher);
    console.log('Password verification: passed');
  } finally {
    rl.close();
  }
}

main()
  .catch(() => {
    // Do not print ORM details because they can contain submitted identifiers.
    console.error('Teacher account update failed. No credential details were printed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
