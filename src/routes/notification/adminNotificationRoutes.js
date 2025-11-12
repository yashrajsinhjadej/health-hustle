// File: routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const {
  sendNotificationToAllUsers,
  sendNotificationToUser,
} = require("../../controllers/notification/adminNotificationController");

// Middleware to verify authentication (customize based on your auth setup)
// const authMiddleware = require("../middleware/auth");

/**
 * POST /api/notifications/send-to-all
 * Send notification to all users with FCM tokens
 * 
 * Body:
 * {
 *   "title": "Notification Title",
 *   "body": "Notification body text",
 *   "data": { "key": "value" },  // optional
 *   "imageUrl": "https://...",    // optional
 *   "android": { ... },           // optional platform-specific config
 *   "apns": { ... },              // optional platform-specific config
 *   "webpush": { ... }            // optional platform-specific config
 * }
 */
router.post("/send-to-all", sendNotificationToAllUsers);

/**
 * POST /api/notifications/send-to-user
 * Send notification to specific user
 * 
 * Body:
 * {
 *   "userId": "user-id-here",
 *   "title": "Notification Title",
 *   "body": "Notification body text",
 *   "data": { "key": "value" },  // optional
 *   "imageUrl": "https://..."     // optional
 * }
 */
router.post("/send-to-user", sendNotificationToUser);

module.exports = router;