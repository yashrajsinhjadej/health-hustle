const express = require('express');
const router = express.Router();

const {getworkoutByIdvalidator,handleValidationErrors,getcategoryvalidator, listWorkoutsValidator} = require('../../../validators/workoutValidators');
const workoutUserController = require('../../../controllers/workout/workoutUserContoller');
const { authenticateToken, adminOrUser } = require('../../../middleware/auth');
const rateLimiters = require('../../../middleware/redisrateLimiter').rateLimiters;


// Import all route modules

// Apply authentication and user authorization to all routes
router.use(authenticateToken); // for checking user authentication and giving user obj in req.user
router.use(adminOrUser); // for checking user authorization
router.use(rateLimiters.api()); // Apply Redis rate limiter for API routes



router.get('/', (req, res) => {
    return res.json({
        success: true,
        message: "Workout User API endpoints",
        user: {
            id: req.user._id,
            name: req.user.name,
            role: req.user.role
        },
        availableEndpoints: [
            'GET /api/workout/user - Get this info',
            // Add more user-specific workout endpoints here
        ]
    });
});

// list all the workout available 
router.get('/listworkout', listWorkoutsValidator, handleValidationErrors, workoutUserController.listworkout);

// get details of a particular workout 
router.post('/getworkoutbyid', getworkoutByIdvalidator, handleValidationErrors, workoutUserController.getworkoutbyid);


//mobile view
router.get('/Homepage', workoutUserController.homepage);


// get all the workout of the particular category 
router.post('/getcategory', getcategoryvalidator, handleValidationErrors, workoutUserController.getcategory);



module.exports = router;