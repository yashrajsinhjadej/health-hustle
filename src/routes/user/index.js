// User Routes - User profile and account management
const express = require('express');
const router = express.Router();
const { authenticateToken, adminOrUser } = require('../../middleware/auth');
const UserController = require('../../controllers/UserController');
const { 
    validateUserProfileUpdate, 
    validateUserFirstTime,
    handleValidationErrors 
} = require('../../validators/userValidators');
const ResponseHandler = require('../../utils/ResponseHandler');
const { upload, checkFileExists } = require('../../middleware/uploadMiddleware');
const validateImageUpload = require('../../middleware/validateImageUpload');
const {rateLimiters} = require('../../middleware/redisrateLimiter');


router.use(authenticateToken); //for checking user authentication and giving user obj in req.user
router.use(adminOrUser); // for checking user authorization


router.use(rateLimiters.api()); // Apply Redis rate limiter for API routes




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
router.post('/firsttime', validateUserFirstTime, handleValidationErrors, UserController.updateFirstTimeProfile);

router.post('/delete', UserController.deleteUserAccount);

router.post('/update', validateUserProfileUpdate, handleValidationErrors, UserController.updateUserProfile);

// POST /user/addprofilepic - Upload or update profile picture
router.post(
    '/addprofilepic',
    upload.single('profilePic'),
    validateImageUpload,
    checkFileExists,
    UserController.addProfilePicture
);

// POST /user/deleteprofilepic - Delete profile picture
router.post('/deleteprofilepic', UserController.deleteProfilePicture);

module.exports = router;
