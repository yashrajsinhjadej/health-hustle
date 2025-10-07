const express = require('express');
const router = express.Router();




router.use('/admin', require('./workoutAdminRoutes'));
router.use('/user', require('./workoutUserRoutes'));

module.exports = router;