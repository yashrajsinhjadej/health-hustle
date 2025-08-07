// Health Routes - Health data management endpoints
const express = require('express');
const router = express.Router();
const { authenticateToken, userOnly } = require('../middleware/auth');
const HealthController = require('../controllers/HealthController');
const {
    validateDateParam,
    validateDateBody,
    validateDailyHealthData,
    validateDailyHealthDataBody,
    validateQuickUpdate,
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
            'PUT /api/health/date - Update health data for specific date (date in body)',
            'POST /api/health/bulk - Bulk update health data for multiple dates',
            'PUT /api/health/quick-update - Quick health updates for TODAY only (water/calories=additive, steps/sleep/weight=replace)'
        ]
    });
});

// GET /health/today - Get today's health data (convenience route)
router.get('/today', HealthController.getTodayHealth); // verified by yash

// PUT /health/bulk - Bulk update health data for multiple dates
router.post('/bulk', validateBulkUpdate, handleHealthValidationErrors, HealthController.bulkUpdateHealthData); // verified by yash

// PUT /health/quick-update - Quick updates for water counter, calories tracker etc.
router.put('/quick-update', validateQuickUpdate, handleHealthValidationErrors, HealthController.quickUpdate); // Quick update for water, calories, etc.

// GET /health/date - Get daily health data for specific date (date in body)
router.get('/date', validateDateBody, handleHealthValidationErrors, HealthController.getDailyHealth); // verified by yash 

// PUT /health/date - Update daily health data for specific date (date in body)
router.put('/date', validateDailyHealthDataBody, handleHealthValidationErrors, HealthController.updateDailyHealth); // verified by yash

module.exports = router;
