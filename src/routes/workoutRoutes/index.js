const express = require('express');
const router = express.Router();




router.use('/admin', require('./workoutAdminRoutes'));
router.use('/user', require('./workoutUserRoutes'));
router.use('/videos', require('./workoutVideoRoutes.js'));


module.exports = router;