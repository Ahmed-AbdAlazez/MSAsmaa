/**
 * Browser Console Debug Script
 * Paste this into the browser console (F12) when on the dashboard to debug notifications
 * 
 * This script will:
 * 1. Check if user is logged in
 * 2. Verify localStorage is set correctly
 * 3. Check if notification bell is in the DOM
 * 4. Test the API endpoint directly
 * 5. Manually trigger a test notification fetch
 */

console.log('%c========== NOTIFICATION DEBUG ==========', 'font-size: 14px; font-weight: bold; color: #0066cc;');

// 1. Check auth state
console.log('\n%c1️⃣  CHECKING AUTH STATE', 'font-weight: bold; color: #0066cc;');
const token = localStorage.getItem('token');
const userRole = localStorage.getItem('userRole');
const userId = localStorage.getItem('userId');
const username = localStorage.getItem('username');

console.log(`   Token exists: ${!!token ? '✅ YES' : '❌ NO'}`);
console.log(`   User role: ${userRole || '❌ NOT SET'}`);
console.log(`   User ID: ${userId || '❌ NOT SET'}`);
console.log(`   Username: ${username || '❌ NOT SET'}`);

if (!token) {
  console.error('\n❌ NOT LOGGED IN! Please log in first.');
  console.log('   Go to: http://localhost:5173/login.html');
} else if (userRole !== 'teacher' && userRole !== 'student') {
  console.error(`\n❌ INVALID ROLE: "${userRole}" (should be "teacher" or "student")`);
}

// 2. Check DOM elements
console.log('\n%c2️⃣  CHECKING DOM ELEMENTS', 'font-weight: bold; color: #0066cc;');
const notificationBtn = document.querySelector('#notification-btn');
const notificationMenu = document.querySelector('#notification-menu');
const notificationList = document.querySelector('#notification-list');

console.log(`   Notification button exists: ${notificationBtn ? '✅ YES' : '❌ NO'}`);
console.log(`   Notification menu exists: ${notificationMenu ? '✅ YES' : '❌ NO'}`);
console.log(`   Notification list exists: ${notificationList ? '✅ YES' : '❌ NO'}`);

if (!notificationBtn) {
  console.error('\n   ⚠️  The notification bell button is not in the DOM!');
  console.log('   Possible causes:');
  console.log('   - Page not fully loaded');
  console.log('   - userRole not set in localStorage');
  console.log('   - Navbar reinitialize happened after updateAuthUI');
}

// 3. Check navbar auth container
console.log('\n%c3️⃣  CHECKING NAVBAR STRUCTURE', 'font-weight: bold; color: #0066cc;');
const navAuthContainer = document.querySelector('.nav-auth-container');
console.log(`   Nav auth container exists: ${navAuthContainer ? '✅ YES' : '❌ NO'}`);
if (navAuthContainer) {
  console.log(`   Container HTML: ${navAuthContainer.innerHTML.substring(0, 100)}...`);
}

// 4. Test API call
console.log('\n%c4️⃣  TESTING API CALL', 'font-weight: bold; color: #0066cc;');
const API_BASE = 'http://localhost:3000/api';

const testNotificationAPI = async () => {
  try {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    console.log(`   Making request to: ${API_BASE}/notifications`);
    console.log(`   Headers: ${JSON.stringify(headers).substring(0, 60)}...`);
    
    const response = await fetch(`${API_BASE}/notifications`, {
      method: 'GET',
      headers: headers,
    });
    
    console.log(`   Response status: ${response.status} (${response.statusText})`);
    
    if (!response.ok) {
      console.error(`   ❌ Request failed with status ${response.status}`);
      const errorText = await response.text();
      console.error(`   Error: ${errorText.substring(0, 200)}`);
      return;
    }
    
    const data = await response.json();
    console.log(`   ✅ Response received:`);
    console.log(`   - Success: ${data.success}`);
    console.log(`   - Notifications count: ${data.notifications ? data.notifications.length : 0}`);
    
    if (data.notifications && data.notifications.length > 0) {
      console.log(`   - First notification: "${data.notifications[0].title}"`);
    }
    
  } catch (error) {
    console.error(`   ❌ API call failed: ${error.message}`);
  }
};

await testNotificationAPI();

// 5. Summary and recommendations
console.log('\n%c========== TROUBLESHOOTING ==========', 'font-weight: bold; color: #0066cc;');

if (!token) {
  console.error('❌ NOT LOGGED IN');
  console.log('ACTION: Log in as a teacher first');
} else if (!notificationBtn) {
  console.error('❌ NOTIFICATION BUTTON NOT IN DOM');
  console.log('ACTION: ');
  console.log('  1. Refresh the page (F5)');
  console.log('  2. Check if localStorage has correct userRole');
  console.log('  3. Check browser console for JavaScript errors');
} else {
  console.log('✅ All checks passed!');
  console.log('   The notification bell should be visible.');
  console.log('   If not visible on screen:');
  console.log('   - Check CSS for display:none');
  console.log('   - Check if navbar was reinitialized after updateAuthUI');
  console.log('   - Look for JavaScript errors (red text in console)');
}

console.log('\n%cDEBUG TIP: Click the notification bell button to open the menu', 'color: #009900; font-size: 11px;');
if (notificationBtn) {
  console.log(`   Command: document.querySelector('#notification-btn').click()`);
}

console.log('%c', 'font-size: 1px;'); // Reset formatting
