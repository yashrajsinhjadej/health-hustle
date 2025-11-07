// Health Routes - Health data management endpoints
const express = require('express');
const router = express.Router();
const { authenticateToken, adminOrUser } = require('../../middleware/auth');
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
const { rateLimiters } = require('../../middleware/redisrateLimiter');  

// Apply authentication and user authorization to all routes
router.use(authenticateToken); // for checking user authentication and giving user obj in req.user
router.use(adminOrUser); // for checking user authorization

router.use(rateLimiters.api()); // Apply Redis rate limiter for Health routes


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
}); //done

// GET /health/today - Get today's health data (convenience route)
router.get('/today', HealthController.getTodayHealth); // timezone done 

// PUT /health/bulk - Bulk update health data for multiple dates
router.post('/bulk', validateBulkUpdate, handleHealthValidationErrors, HealthController.bulkUpdateHealthData); //timezone done

// GET /health/date - Get daily health data for specific date (date in body)
router.post('/date', validateDateBody, handleHealthValidationErrors, HealthController.getDailyHealth); //timezone done

router.post('/water', validateWaterBody, handleHealthValidationErrors, HealthController.addwater); //timezone done 
router.post('/getwater',validateDateBody,handleHealthValidationErrors,HealthController.getwater); //timezone done


router.post('/sleep', validateSleepBody, handleHealthValidationErrors, HealthController.addsleep); //timezone done 
router.get('/getsleep',HealthController.getsleep); //timezone done

router.post('/calories',validatecalories,handleHealthValidationErrors,HealthController.addCalories); //timezone done 
router.post('/getcalories',validateDateBody,handleHealthValidationErrors,HealthController.getcalories); //timezone done 

router.post('/weeklyreport',validateDateBody,handleHealthValidationErrors,HealthController.weeklyreport); //timezone done
router.post('/monthlyreport',validateDateBody,handleHealthValidationErrors,HealthController.monthlyreport); //timezone added 



router.get('/steps', HealthController.getsteps);



const { upload, checkFileExists } = require('../../middleware/uploadMiddleware');
const Logger = require('../../utils/logger');

// POST /api/calories/estimate
router.post(
    '/estimate',
    (req, res, next) => {
      // Log the incoming form-data fields for debugging
      if (req.body && Object.keys(req.body).length > 0) {
        Logger.info('Estimate endpoint form fields', null, { fields: req.body });
      }
      next();
    },
    upload.single('image'), // 'image' is the field name in form-data
    (err, req, res, next) => {
      if (err) {
        Logger.error('Upload error in estimate endpoint', null, { error: err.message });
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    },
    checkFileExists,
    HealthController.estimateCalories
  );
    


module.exports = router;


