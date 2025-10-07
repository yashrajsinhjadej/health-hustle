// User Routes - User profile and account management
const express = require('express');
const router = express.Router();
const { authenticateToken, userOnly } = require('../../middleware/auth');
const UserController = require('../../controllers/UserController');
const { 
    validateUserProfileUpdate, 
    handleValidationErrors 
} = require('../../validators/userValidators');
const ResponseHandler = require('../../utils/ResponseHandler');
const createCustomRateLimit = require('../../middleware/customRateLimit');


// Create rate limiter for user routes using environment variables
const userRateLimit = createCustomRateLimit(
    parseInt(process.env.USER_ROUTES_LIMIT) || 60, 
    parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
); // User routes rate limit from env

// Apply authentication and user authorization to all routes
router.use(authenticateToken); //for checking user authentication and giving user obj in req.user
router.use(userOnly);// for checking user authorization 
router.use(userRateLimit); // Rate limit to 60 requests per minute per user


router.get('/', (req, res) => {
    return ResponseHandler.success(res, "User API endpoints", {
        user: {
            id: req.user._id,
            name: req.user.name,
            role: req.user.role
        },
        availableEndpoints: [
            'GET /api/user/profile - Get user profile',
            'PUT /api/user/firsttime - Complete first-time profile setup'
        ]
    });
});

// GET /user/profile - Get user profile 
router.get('/profile', UserController.getUserProfile); // verified by 

// PUT /user/firsttime - Complete profile setup during first registration
router.post('/firsttime', validateUserProfileUpdate, handleValidationErrors, UserController.updateUserProfile);

module.exports = router;
