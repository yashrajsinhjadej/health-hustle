// User Routes - User profile and account management
const express = require('express');
const router = express.Router();
const { authenticateToken, userOnly } = require('../middleware/auth');
const UserController = require('../controllers/UserController');
const { 
    validateUserProfileUpdate, 
    handleValidationErrors 
} = require('../validators/userValidators');

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
            'GET /api/user/profile - Get user profile',
            'PUT /api/user/firsttime - Complete first-time profile setup'
        ]
    });
});

// GET /user/profile - Get user profile 
router.get('/profile', UserController.getUserProfile); // verified by yash

// PUT /user/firsttime - Complete profile setup during first registration
router.put('/firsttime', validateUserProfileUpdate, handleValidationErrors, UserController.updateUserProfile);

module.exports = router;
