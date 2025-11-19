// File: routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const {
  sendNotificationToAllUsers,
  updateNotificationStatus,
  getNotificationHistory,
  getScheduledNotifications,
  getNotificationStats
} = require("../../controllers/notification/adminNotificationController");
const { authenticateToken, adminOnly } = require("../../middleware/auth");
const { validateAdminNotification, handleValidationErrors } = require("../../validators/notificationValidators");


router.use(authenticateToken);
router.use(adminOnly);


router.post("/send-to-all", validateAdminNotification, handleValidationErrors, sendNotificationToAllUsers);

router.post(
  "/:id/status",
  updateNotificationStatus
);



// GET /api/notifications/history?page=1&limit=10
router.get('/history', getNotificationHistory);

router.get('/scheduled', getScheduledNotifications);


module.exports = router;