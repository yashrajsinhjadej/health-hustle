const express = require('express');
const router = express.Router();

const { authenticateToken, adminOnly } = require('../../middleware/auth');

const {createWorkoutValidator,handleValidationErrors} = require('../../validators/workoutValidators');

const workoutAdminController = require('../../controllers/workout/workoutAdminController');





// Apply authentication and user authorization to all routes
router.use(authenticateToken); // for checking user authentication and giving user obj in req.user
router.use(adminOnly);        // for checking user authorization

// --- Endpoints ---

router.get('/', (req, res) => {
    return res.json({
        success: true,
        message: "Workout Admin API endpoints",
        user: {
            id: req.user._id,
            name: req.user.name,
            role: req.user.role
        },
        availableEndpoints: [
            'GET /api/workout/admin - Get this info',
            'POST /api/workout/admin/create - Create a new workout (name, description, duration, intensity)'
            // Add more admin-specific workout endpoints here
        ]
    });
});

// CREATE WORKOUT ENDPOINT with a simple success response
router.post(
    '/create',
    createWorkoutValidator,        // Validation middleware
    handleValidationErrors,         // Error handling middleware for validation
    workoutAdminController.createWorkout  // Controller logic to handle workout creation);
);

module.exports = router;