const express = require('express');
const router = express.Router();




router.use('/admin', require('./admin/workoutAdminRoutes.js'));
router.use('/user', require('./user/workoutUserRoutes.js'));
router.use('/admin/videos', require('./admin/workoutVideoRoutes.js'));
router.use('/admin/category',require('./admin/CategoryAdminRoutes.js'))

module.exports = router;