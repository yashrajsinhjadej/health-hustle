const express = require('express');
const router = express.Router();
const multer = require('multer');

// Error handling middleware for multer errors
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
router.use('/', require('./debugroutes/debugRoutes'));
// Import all route modules
router.use('/auth', require('./authRoutes/authRoutes'));
router.use('/admin', require('./adminRoutes/adminRoutes'));
router.use('/users', require('./adminRoutes/adminRoutes')); // Alias for frontend compatibility
router.use('/user', require('./userRoutes/userRoutes'));
router.use('/health', require('./healthRoutes/healthRoutes'));
router.use('/workout', require('./workoutRoutes/index'));


module.exports = router;
