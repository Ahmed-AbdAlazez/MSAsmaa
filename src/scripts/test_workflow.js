const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const app = require('../app');
const { prisma, disconnectDB } = require('../config/db');

let server;
let baseUrl;

const request = (path, options = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
};

async function runTests() {
  console.log('==============================================');
  console.log('  STARTING VERIFICATION OF ALL WORKFLOWS');
  console.log('==============================================\n');

  // Start temporary server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[Test] Test server running on ${baseUrl}`);
      resolve();
    });
  });

  try {
    // Cleanup any existing test students
    await prisma.user.deleteMany({
      where: {
        studentCode: { in: ['STU_TEST_01', 'STU_TEST_02'] },
      },
    });

    // 1. Health check
    console.log('--- TEST 1: Health Check ---');
    const healthRes = await request('/api/health');
    console.log('GET /api/health:', healthRes.status, healthRes.body);
    if (healthRes.status !== 200) throw new Error('Health check failed');

    // 2. Student Signup
    console.log('\n--- TEST 2: Student Registration ---');
    const signupRes = await request('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        studentCode: 'STU_TEST_01',
        name: 'Ahmed Student',
        password: 'Password123!',
      },
    });
    console.log('POST /api/v1/auth/signup:', signupRes.status, signupRes.body);
    if (signupRes.status !== 201) throw new Error('Student signup failed');
    if (signupRes.body.token) throw new Error('Token should NOT be returned on signup');

    // 3. Duplicate Signup Prevention
    console.log('\n--- TEST 3: Duplicate Student Code Signup ---');
    const dupSignupRes = await request('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        studentCode: 'STU_TEST_01',
        name: 'Duplicate Student',
        password: 'Password123!',
      },
    });
    console.log('POST /api/v1/auth/signup (Duplicate):', dupSignupRes.status, dupSignupRes.body);
    if (dupSignupRes.status !== 409 && dupSignupRes.status !== 400) {
      throw new Error('Duplicate student code was not prevented');
    }

    // 4. Pending Student Login Prevention
    console.log('\n--- TEST 4: Pending Student Login Rejection ---');
    const pendingLoginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        studentCode: 'STU_TEST_01',
        password: 'Password123!',
      },
    });
    console.log('POST /api/v1/auth/login (PENDING):', pendingLoginRes.status, pendingLoginRes.body);
    if (pendingLoginRes.status !== 403) throw new Error('Pending student should not be able to log in');

    // 5. Teacher Login
    console.log('\n--- TEST 5: Teacher Login ---');
    const teacherLoginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        studentCode: process.env.TEACHER_CODE || 'TEACHER01',
        password: process.env.TEACHER_PASSWORD || 'TeacherSecret123!',
      },
    });
    console.log('POST /api/v1/auth/login (TEACHER):', teacherLoginRes.status, {
      status: teacherLoginRes.body.status,
      token: teacherLoginRes.body.token ? '[REDACTED_JWT]' : undefined,
      user: teacherLoginRes.body.data?.user,
    });
    if (teacherLoginRes.status !== 200 || !teacherLoginRes.body.token) {
      throw new Error('Teacher login failed');
    }
    const teacherToken = teacherLoginRes.body.token;

    // 6. Teacher Get Pending Count
    console.log('\n--- TEST 6: Get Pending Requests Count ---');
    const countRes = await request('/api/v1/registration-requests/count', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    console.log('GET /api/v1/registration-requests/count:', countRes.status, countRes.body);
    if (countRes.status !== 200 || countRes.body.data.count < 1) {
      throw new Error('Get pending count failed');
    }

    // 7. Teacher Get Pending Requests List
    console.log('\n--- TEST 7: Get Pending Requests List ---');
    const listRes = await request('/api/v1/registration-requests', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    console.log('GET /api/v1/registration-requests:', listRes.status, listRes.body);
    if (listRes.status !== 200 || !listRes.body.data.requests) {
      throw new Error('Get pending requests list failed');
    }
    const student1 = listRes.body.data.requests.find((r) => r.studentCode === 'STU_TEST_01');
    if (!student1) throw new Error('Student 1 not found in pending list');
    if (student1.password) throw new Error('Password hash leaked in student list!');

    // 8. Teacher Approves Student 1
    console.log('\n--- TEST 8: Teacher Approves Student 1 ---');
    const approveRes = await request(`/api/v1/registration-requests/${student1.id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    console.log('PATCH /api/v1/registration-requests/:id/approve:', approveRes.status, approveRes.body);
    if (approveRes.status !== 200 || approveRes.body.data.user.status !== 'APPROVED') {
      throw new Error('Student approval failed');
    }

    // 9. Approved Student Login
    console.log('\n--- TEST 9: Approved Student Login ---');
    const studentLoginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        studentCode: 'STU_TEST_01',
        password: 'Password123!',
      },
    });
    console.log('POST /api/v1/auth/login (APPROVED):', studentLoginRes.status, {
      status: studentLoginRes.body.status,
      token: studentLoginRes.body.token ? '[REDACTED_JWT]' : undefined,
      user: studentLoginRes.body.data?.user,
    });
    if (studentLoginRes.status !== 200 || !studentLoginRes.body.token) {
      throw new Error('Approved student login failed');
    }
    const studentToken = studentLoginRes.body.token;

    // 10. Student Attempting Teacher Routes (RBAC Check)
    console.log('\n--- TEST 10: Role-Based Access Control (Student accessing Teacher route) ---');
    const studentAccessDeniedRes = await request('/api/v1/registration-requests', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    console.log('GET /api/v1/registration-requests (As STUDENT):', studentAccessDeniedRes.status, studentAccessDeniedRes.body);
    if (studentAccessDeniedRes.status !== 403) {
      throw new Error('Student should be forbidden from teacher routes (403 expected)');
    }

    // 11. Unauthenticated Access Check
    console.log('\n--- TEST 11: Unauthenticated Access to Protected Route ---');
    const unauthRes = await request('/api/v1/registration-requests');
    console.log('GET /api/v1/registration-requests (No Token):', unauthRes.status, unauthRes.body);
    if (unauthRes.status !== 401) {
      throw new Error('Unauthenticated request should return 401');
    }

    // 12. Reject Flow (Student 2)
    console.log('\n--- TEST 12: Reject Flow for Student 2 ---');
    await request('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        studentCode: 'STU_TEST_02',
        name: 'Sara Student',
        password: 'Password123!',
      },
    });

    const listRes2 = await request('/api/v1/registration-requests', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const student2 = listRes2.body.data.requests.find((r) => r.studentCode === 'STU_TEST_02');
    if (!student2) throw new Error('Student 2 not found in pending list');

    const rejectRes = await request(`/api/v1/registration-requests/${student2.id}/reject`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    console.log('PATCH /api/v1/registration-requests/:id/reject:', rejectRes.status, rejectRes.body);
    if (rejectRes.status !== 200 || rejectRes.body.data.user.status !== 'REJECTED') {
      throw new Error('Student rejection failed');
    }

    // 13. Rejected Student Login Attempt
    console.log('\n--- TEST 13: Rejected Student Login Attempt ---');
    const rejectedLoginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        studentCode: 'STU_TEST_02',
        password: 'Password123!',
      },
    });
    console.log('POST /api/v1/auth/login (REJECTED):', rejectedLoginRes.status, rejectedLoginRes.body);
    if (rejectedLoginRes.status !== 403) {
      throw new Error('Rejected student should be forbidden from logging in (403 expected)');
    }

    console.log('\n==============================================');
    console.log('  ALL 13 TESTS PASSED SUCCESSFULLY! ✅');
    console.log('==============================================');
  } finally {
    // Cleanup test records
    await prisma.user.deleteMany({
      where: {
        studentCode: { in: ['STU_TEST_01', 'STU_TEST_02'] },
      },
    });
    server.close();
    await disconnectDB();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Error:', err);
  if (server) server.close();
  disconnectDB().finally(() => process.exit(1));
});
