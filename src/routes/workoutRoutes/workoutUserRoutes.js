const express = require('express');
const router = express.Router();

const {getworkoutByIdvalidator,handleValidationErrors,getcategoryvalidator, listWorkoutsValidator} = require('../../validators/workoutValidators');
const workoutUserController = require('../../controllers/workout/workoutUserContoller');
const { authenticateToken, adminOrUser } = require('../../middleware/auth');



// Import all route modules

// Apply authentication and user authorization to all routes
router.use(authenticateToken); // for checking user authentication and giving user obj in req.user
router.use(adminOrUser); // for checking user authorization




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


router.get('/listworkout', listWorkoutsValidator, handleValidationErrors, workoutUserController.listworkout);

router.post('/getworkoutbyid', getworkoutByIdvalidator, handleValidationErrors, workoutUserController.getworkoutbyid);

router.get('/Homepage', workoutUserController.homepage);

router.post('/getcategory', getcategoryvalidator, handleValidationErrors, workoutUserController.getcategory);
// router.post('/search', workoutUserController.searchworkout);

module.exports = router;