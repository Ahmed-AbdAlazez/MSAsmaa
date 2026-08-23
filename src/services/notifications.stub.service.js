/**
 * notifications.stub.service.js
 * ===========================================================================
 * REPLACE THIS STUB - DO NOT SHIP TO PRODUCTION
 * ===========================================================================
 *
 * In-memory notification store to support the notification bell feature.
 * Swap this for a real database table check when database schema is finalized.
 */

// In-memory array of notifications:
// Shape: { id, userId, title, message, link, read, type, createdAt }
const notifications = [];

// Enrolled student mapping helper
const enrolledStudentsByCourse = {
  "biology": ["student-1"] // student-2 is not enrolled in biology
};

/**
 * Get enrolled student IDs for a given course.
 * @param {string} courseId 
 * @returns {Promise<string[]>}
 */
async function getEnrolledStudents(courseId) {
  return enrolledStudentsByCourse[courseId] || [];
}

/**
 * Creates notifications for all students enrolled in a course.
 * @param {string} courseId 
 * @param {string} message 
 * @param {string} link 
 * @returns {Promise<object[]>}
 */
async function createNotificationForEnrolledStudents(courseId, message, link) {
  const studentIds = await getEnrolledStudents(courseId);
  const type = link.includes("lesson") ? "video" : "quiz";
  const title = type === "quiz" ? "اختبار جديد متاح" : "فيديو جديد متاح";

  const newNotifications = studentIds.map(studentId => {
    const notification = {
      id: `notify-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: studentId,
      title,
      message,
      link,
      read: false,
      type,
      createdAt: new Date().toISOString()
    };
    notifications.unshift(notification);
    return notification;
  });

  return newNotifications;
}

/**
 * Fetch all notifications for a specific user.
 * @param {string} userId 
 * @returns {Promise<object[]>}
 */
async function getNotificationsForUser(userId) {
  return notifications.filter(n => n.userId === userId);
}

/**
 * Mark a specific notification as read.
 * @param {string} notificationId 
 * @param {string} userId 
 * @returns {Promise<boolean>}
 */
async function markNotificationAsRead(notificationId, userId) {
  const notification = notifications.find(n => n.id === notificationId && n.userId === userId);
  if (notification) {
    notification.read = true;
    return true;
  }
  return false;
}

/**
 * Mark all notifications for a user as read.
 * @param {string} userId 
 * @returns {Promise<void>}
 */
async function markAllNotificationsAsRead(userId) {
  notifications.forEach(n => {
    if (n.userId === userId) {
      n.read = true;
    }
  });
}

module.exports = {
  createNotificationForEnrolledStudents,
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getEnrolledStudents
};
