const express = require('express');
const router = express.Router();




router.use('/admin', require('./workoutAdminRoutes'));
router.use('/user', require('./workoutUserRoutes'));
router.use('/videos', require('./workoutVideoRoutes.js'));
router.use('/category',require('./Category.js'))

module.exports = router;