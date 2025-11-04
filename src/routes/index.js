const express = require('express');
const router = express.Router();
const multer = require('multer');

// ============================================
// DEBUG ROUTES (Development Only)
// ============================================
if (process.env.NODE_ENV !== 'production') {
  router.use('/debug', require('./debug'));
  console.log('🐛 Debug routes enabled (development mode)');
}

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================
router.use('/cms', require('./cms')); // Public CMS pages & FAQ

// ============================================
// AUTHENTICATION ROUTES
// ============================================
router.use('/auth', require('./auth'));

// ============================================
// PROTECTED ROUTES (Authentication Required)
// ============================================
router.use('/admin', require('./admin'));      // Admin user management & dashboard
router.use('/user', require('./user'));        // User profile & account management
router.use('/health', require('./health'));    // Health data tracking (water, sleep, calories)
router.use('/workout', require('./workout'));  // Workout features (admin & user)

// ============================================
// MULTER ERROR HANDLING
// ============================================
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size is too large. Max limit is 5MB'
      });
    }
  }
  return res.status(500).json({
    success: false,
    message: error.message
  });
});

module.exports = router;
