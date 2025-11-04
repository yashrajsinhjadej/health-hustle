const express = require('express');
const router = express.Router();

// ============================================
// WORKOUT ROUTES
// ============================================

// Admin workout management
router.use('/admin', require('./admin/workouts'));
router.use('/admin/videos', require('./admin/videos'));
router.use('/admin/category', require('./admin/categories'));

// User workout access
router.use('/user', require('./user'));

module.exports = router;