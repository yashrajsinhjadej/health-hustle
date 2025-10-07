// Health Routes - Health data management endpoints
const express = require('express');
const router = express.Router();
const { authenticateToken, userOnly } = require('../../middleware/auth');
const HealthController = require('../../controllers/HealthController');
const {
    validateWaterBody,
    validateDateBody,
    validateBulkUpdate,
    validatecalories,
    validateSleepBody,
    validateImageUpload,
    handleValidationErrors: handleHealthValidationErrors
} = require('../../validators/healthValidators');
const createCustomRateLimit = require('../../middleware/customRateLimit');

// Create rate limiter for health routes using environment variables
const healthRateLimit = createCustomRateLimit(
    parseInt(process.env.HEALTH_ROUTES_LIMIT) || 50, 
    parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
); // Health routes rate limit from env

// Apply authentication and user authorization to all routes
router.use(authenticateToken); // for checking user authentication and giving user obj in req.user
router.use(userOnly); // for checking user authorization
router.use(healthRateLimit); // Rate limit to 50 requests per minute per user

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
            'POST /api/health/water - Update water consumption for TODAY (water=additive)',
            'POST /api/health/calories - Update calorie intake for TODAY (calories=additive)',
        ]
    });
});

// GET /health/today - Get today's health data (convenience route)
router.get('/today', HealthController.getTodayHealth); // verified by yash

// PUT /health/bulk - Bulk update health data for multiple dates
router.post('/bulk', validateBulkUpdate, handleHealthValidationErrors, HealthController.bulkUpdateHealthData); // verified by yashraj 

// GET /health/date - Get daily health data for specific date (date in body)
router.post('/date', validateDateBody    , handleHealthValidationErrors, HealthController.getDailyHealth); // verified by yash 


router.post('/water', validateWaterBody, handleHealthValidationErrors, HealthController.addwater); // verified by yash
router.post('/getwater',validateDateBody,handleHealthValidationErrors,HealthController.getwater);


router.post('/sleep', validateSleepBody, handleHealthValidationErrors, HealthController.addsleep);
router.get('/getsleep',HealthController.getsleep);

router.post('/calories',validatecalories,handleHealthValidationErrors,HealthController.addCalories); // verified by yash
router.post('/getcalories',validateDateBody,handleHealthValidationErrors,HealthController.getcalories);

router.post('/weeklyreport',validateDateBody,handleHealthValidationErrors,HealthController.weeklyreport);
router.post('/monthlyreport',validateDateBody,handleHealthValidationErrors,HealthController.monthlyreport);



router.get('/steps', HealthController.getsteps);



const { upload, checkFileExists } = require('../../middleware/uploadMiddleware');
router.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });

// POST /api/calories/estimate
router.post(
    '/estimate',
    (req, res, next) => {
      // Log the incoming form-data fields
      if (req.body) {
        console.log('Form fields:', req.body);
      }
      next();
    },
    upload.single('image'), // 'image' is the field name in form-data
    (err, req, res, next) => {
      if (err) {
        console.error('Upload error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    },
    checkFileExists,
    HealthController.estimateCalories
  );
    


module.exports = router;


