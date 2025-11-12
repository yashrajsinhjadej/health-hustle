const express = require('express');
const router = express.Router();

// ============================================
// WORKOUT ROUTES
// ============================================

router.use('/admin', require('./adminNotificationRoutes'));
// User workout access
router.use('/user', require('./userNotificationRoutes'));

module.exports = router;