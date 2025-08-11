// Admin Routes - Simple admin endpoints
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken, adminOnly } = require('../middleware/auth');
const ResponseHandler = require('../utils/ResponseHandler');

// Apply authentication and admin authorization to all routes
router.use(authenticateToken);
router.use(adminOnly);

// GET /admin/dashboard - Simple admin dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        
        return ResponseHandler.success(res, "Admin dashboard accessed successfully", {
            stats: {
                totalUsers
            },
            admin: {
                id: req.user._id,
                name: req.user.name,
                phone: req.user.phone,
                role: req.user.role
            }
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        return ResponseHandler.serverError(res, "Failed to load dashboard");
    }
});

module.exports = router;
