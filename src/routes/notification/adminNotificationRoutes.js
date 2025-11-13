// File: routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const {
  sendNotificationToAllUsers,
  sendNotificationToUser,
  updateNotificationStatus,
} = require("../../controllers/notification/adminNotificationController");
const { authenticateToken, adminOnly } = require("../../middleware/auth");
const {validateAdminNotification,handleValidationErrors} = require("../../validators/notificationValidators");


router.use(authenticateToken);
router.use(adminOnly);


router.post("/send-to-all", validateAdminNotification, handleValidationErrors, sendNotificationToAllUsers);

router.post(
  "/:id/status",
  updateNotificationStatus
);


router.post("/send-to-user", validateAdminNotification, handleValidationErrors, sendNotificationToUser);

module.exports = router;