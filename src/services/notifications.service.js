const { prisma } = require('../config/db');

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  relatedId: true,
  relatedType: true,
  link: true,
  isRead: true,
  createdAt: true,
};

async function createNotificationForApprovedStudents({
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
  link = null,
}) {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', status: 'APPROVED' },
    select: { id: true },
  });

  if (!students.length) return { count: 0 };

  return prisma.notification.createMany({
    data: students.map(({ id }) => ({
      userId: id,
      type,
      title,
      message,
      relatedId,
      relatedType,
      link,
    })),
  });
}

async function getNotificationsForUser(userId) {
  return prisma.notification.findMany({
    where: { userId },
    select: notificationSelect,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

async function getUnreadCount(userId) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

async function markNotificationAsRead(notificationId, userId) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  return result.count > 0;
}

async function markAllNotificationsAsRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

module.exports = {
  createNotificationForApprovedStudents,
  getNotificationsForUser,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};