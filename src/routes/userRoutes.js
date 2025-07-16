// User Routes - Regular user endpoints
const express = require('express');
const router = express.Router();
const { authenticateToken, userOnly } = require('../middleware/auth');

// Apply authentication and user authorization to all routes
router.use(authenticateToken); //for checking user authentication and giving user obj in req.user
router.use(userOnly);// for checking user authorization 


// GET /user/dashboard - Simple user dashboard
router.get('/dashboard', async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'User dashboard accessed successfully',
            user: {
                id: req.user._id,
                name: req.user.name,
                phone: req.user.phone,
                role: req.user.role
            }
        });
    } catch (error) {
        console.error('User dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

router.put('/dashboard', async (req, res) =>{
    res.send({
        success: true,
        message: 'doing updates',
        user: {
            id: req.user._id,
            phone: req.user.phone,
            role: req.user.role
        }
    });
})


module.exports = router;
