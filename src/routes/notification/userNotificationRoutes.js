const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const userNotificationController = require('../../controllers/notification/userNotificationController');
const {
    notificationFeedValidator,
    handleUserNotificationValidation
} = require('../../validators/userNotificationValidators');

router.use(authenticateToken);

router.get(
    '/feed',
    notificationFeedValidator,
    handleUserNotificationValidation,
    userNotificationController.getNotificationFeed.bind(userNotificationController)
);

router.get('/', (req, res) => {
    res.json({
        message: 'Notification API Endpoints',
        availableEndpoints: [
            'GET /api/notification/admin - Admin notification management endpoints',
            'GET /api/notification/user/feed - User notification feed'
        ]
    });
});

module.exports = router;