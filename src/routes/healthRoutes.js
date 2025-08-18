// Health Routes - Health data management endpoints
const express = require('express');
const router = express.Router();
const { authenticateToken, userOnly } = require('../middleware/auth');
const HealthController = require('../controllers/HealthController');
const {
    validateWaterBody,
    validateDateBody,
    validateBulkUpdate,
    handleValidationErrors: handleHealthValidationErrors
} = require('../validators/healthValidators');

// Apply authentication and user authorization to all routes
router.use(authenticateToken); // for checking user authentication and giving user obj in req.user
router.use(userOnly); // for checking user authorization 

router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Health API endpoints',
        user: {
            id: req.user._id,
            name: req.user.name,
            role: req.user.role
        },
        availableEndpoints: [
            'GET /api/health/today - Get today\'s health data',
            'GET /api/health/date - Get health data by specific date (date in body)',
            'POST /api/health/bulk - Bulk update health data for multiple dates',
            'PUT /api/health/quick-update - Quick health updates for TODAY only (water=additive, steps/sleep=replace)',
            'POST /api/health/water - Update water consumption for TODAY (water=additive)'
        ]
    });
});

// GET /health/today - Get today's health data (convenience route)
router.get('/today', HealthController.getTodayHealth); // verified by yash

// PUT /health/bulk - Bulk update health data for multiple dates
router.post('/bulk', validateBulkUpdate, handleHealthValidationErrors, HealthController.bulkUpdateHealthData); // verified by yashraj 

// GET /health/date - Get daily health data for specific date (date in body)
router.post('/date', validateDateBody    , handleHealthValidationErrors, HealthController.getDailyHealth); // verified by yash 
 // verified by yash

router.post('/water', validateWaterBody, handleHealthValidationErrors, HealthController.addwater); // verified by yash


// router.post('/calories',validatecalories,handleHealthValidationErrors, ); // verified by yash
module.exports = router;


