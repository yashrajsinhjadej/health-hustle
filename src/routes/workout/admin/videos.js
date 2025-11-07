const express = require('express');
const { adminOnly, authenticateToken } = require('../../../middleware/auth');
const router = express.Router();
const { handleValidationErrors,updateWorkoutVideoValidator,deleteWorkoutVideoValidator,createWorkoutVideoValidator } = require('../../../validators/workoutvideoValidator');
const WorkoutVideoController = require('../../../controllers/workout/workoutvideoAdminController');
const rateLimiters = require('../../../middleware/redisrateLimiter').rateLimiters;
// adding the middleware for the video 

router.use(authenticateToken)
router.use(adminOnly)
router.use(rateLimiters.admin()); // Apply Redis rate limiter for admin routes
router.post('/create', createWorkoutVideoValidator, handleValidationErrors, WorkoutVideoController.createWorkoutVideo);

router.post('/update', updateWorkoutVideoValidator, handleValidationErrors, WorkoutVideoController.updateWorkoutVideo);

router.post('/delete', deleteWorkoutVideoValidator, handleValidationErrors, WorkoutVideoController.deleteWorkoutVideo);




module.exports = router;