const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const {
  getNotificationsForUser,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotificationForApprovedStudents,
} = require("../services/notifications.service.js");

const router = express.Router();

const requireAuthenticatedUser = (req, res, next) => {
  // Both students and teachers can access notifications
  if (req.user.role !== "student" && req.user.role !== "teacher") {
    return res
      .status(403)
      .json({ error: "الطلاب والمعلمات فقط يمكنهم الوصول إلى الإشعارات." });
  }
  return next();
};

/**
 * GET /api/notifications
 * Retrieves notifications for the authenticated user (student or teacher).
 */
router.get("/notifications", requireAuth, requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const items = await getNotificationsForUser(userId);
    return res.json({
      success: true,
      notifications: items.map((item) => ({ ...item, read: item.isRead })),
    });
  } catch (error) {
    console.error("[notifications.routes] Fetch failed:", error);
    return res.status(500).json({ error: "فشل تحميل الإشعارات." });
  }
});

router.get(
  "/notifications/unread-count",
  requireAuth,
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      const count = await getUnreadCount(req.user.id);
      return res.json({ success: true, count });
    } catch (error) {
      console.error("[notifications.routes] Unread count failed:", error);
      return res.status(500).json({ error: "فشل تحميل عدد الإشعارات غير المقروءة." });
    }
  },
);

/**
 * POST /api/notifications/:id/read
 * Marks a single notification as read.
 */
router.post(
  "/notifications/:id/read",
  requireAuth,
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const notificationId = req.params.id;
      const success = await markNotificationAsRead(notificationId, userId);
      if (!success) {
        return res
          .status(404)
          .json({ error: "الإشعار غير موجود أو لا يمكن الوصول إليه." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("[notifications.routes] Mark read failed:", error);
      return res
        .status(500)
        .json({ error: "فشل تعليم الإشعار كمقروء." });
    }
  },
);

router.patch(
  "/notifications/:id/read",
  requireAuth,
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      const success = await markNotificationAsRead(req.params.id, req.user.id);
      if (!success)
        return res
          .status(404)
          .json({ error: "الإشعار غير موجود أو لا يمكن الوصول إليه." });
      return res.json({ success: true });
    } catch (error) {
      console.error("[notifications.routes] Mark read failed:", error);
      return res
        .status(500)
        .json({ error: "فشل تعليم الإشعار كمقروء." });
    }
  },
);

/**
 * POST /api/notifications/mark-all-read
 * Marks all notifications of the user as read.
 */
router.post(
  "/notifications/mark-all-read",
  requireAuth,
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      const userId = req.user.id;
      await markAllNotificationsAsRead(userId);
      return res.json({ success: true });
    } catch (error) {
      console.error("[notifications.routes] Mark all read failed:", error);
      return res
        .status(500)
        .json({ error: "فشل تعليم الإشعارات كمقروءة." });
    }
  },
);

router.patch(
  "/notifications/read-all",
  requireAuth,
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      await markAllNotificationsAsRead(req.user.id);
      return res.json({ success: true });
    } catch (error) {
      console.error("[notifications.routes] Mark all read failed:", error);
      return res
        .status(500)
        .json({ error: "فشل تعليم الإشعارات كمقروءة." });
    }
  },
);

/**
 * POST /api/notifications/quiz
 * Creates a notification when a teacher publishes a quiz (uses requireAuth, teacher-only).
 */
router.post("/notifications/quiz", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res
      .status(403)
      .json({ error: "المعلمات فقط يمكنهن نشر إشعارات الاختبارات." });
  }

  const { title } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "عنوان الاختبار مطلوب." });
  }

  try {
    const trimmedTitle = title.trim();
    await createNotificationForApprovedStudents({
      type: "quiz",
      title: "امتحان جديد",
      message: `تم إضافة امتحان جديد: ${trimmedTitle}`,
      relatedType: "quiz",
      link: "/exams",
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("[notifications.routes] Quiz notification failed:", error);
    return res
      .status(500)
      .json({ error: "فشل نشر إشعار الاختبار." });
  }
});

module.exports = router;
