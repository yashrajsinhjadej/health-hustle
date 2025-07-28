// User Routes - Regular user endpoints
const express = require('express');
const router = express.Router();
const { authenticateToken, userOnly } = require('../middleware/auth');
const HealthController = require('../controllers/HealthController');
const UserController = require('../controllers/UserController');

// Apply authentication and user authorization to all routes
router.use(authenticateToken); //for checking user authentication and giving user obj in req.user
router.use(userOnly);// for checking user authorization 

router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'User API endpoints',
        user: {
            id: req.user._id,
            name: req.user.name,
            role: req.user.role
        },
        availableEndpoints: [
            'GET /api/user/dashboard - Get user profile',
            'PUT /api/user/dashboard - Update user profile',
            'GET /api/user/health/today - Get today\'s health data',
            'GET /api/user/health/:date - Get health data by date',
            'PUT /api/user/health/:date - Update health data',
            'PUT /api/user/health/bulk - Bulk update health data',
            'PUT /api/user/health/quick-update - Quick health update'
        ]
    });
});

// get user profile 
router.get('/dashboard',UserController.getUserProfile);   // verified by yash


// Put all the necessary information at the timeof the first registration left somethings to update
router.put('/dashboard', UserController.updateUserProfile); 

// PUT /user/health/bulk - Bulk update health data for multiple dates
router.put('/health/bulk', HealthController.bulkUpdateHealthData); // verified by yash

// PUT /user/health/:date - Update daily health data for specific date
router.put('/health/:date', HealthController.updateDailyHealth); //verified by yash

// GET /user/health/today - Get today's health data (convenience route)
router.get('/health/today', HealthController.getTodayHealth); //verified by yash

// GET /user/health/:date - Get daily health data for specific date  
router.get('/health/:date', HealthController.getDailyHealth); //verified by yash 

// for updating quiclkly like water counter calaries tracker etc .
router.put('/health/quick-update', HealthController.quickUpdate); // Quick update for water, calories, etc.

module.exports = router;
