const express = require('express');
const { adminOnly, authenticateToken } = require('../../middleware/auth');
const router = express.Router();
const { handleValidationErrors,updateWorkoutVideoValidator,deleteWorkoutVideoValidator,createWorkoutVideoValidator } = require('../../validators/workoutvideoValidator');
const WorkoutVideoController = require('../../controllers/workout/workoutvideoAdminController');
// adding the middleware for the video 
router.use(authenticateToken)
router.use(adminOnly)

router.post('/create', createWorkoutVideoValidator, handleValidationErrors, WorkoutVideoController.createWorkoutVideo);

router.post('/update', updateWorkoutVideoValidator, handleValidationErrors, WorkoutVideoController.updateWorkoutVideo);

router.post('/delete', deleteWorkoutVideoValidator, handleValidationErrors, WorkoutVideoController.deleteWorkoutVideo);




module.exports = router;