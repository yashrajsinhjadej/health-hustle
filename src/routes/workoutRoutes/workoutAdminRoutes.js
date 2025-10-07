const express = require('express');
const router = express.Router();

const { authenticateToken, adminOnly } = require('../../middleware/auth');
// Import all route modules

// Apply authentication and user authorization to all routes
router.use(authenticateToken); // for checking user authentication and giving user obj in req.user
router.use(adminOnly); // for checking user authorization


router.use('/',(req,res)=>{
    res.json({
        success:true,
        message:"Workout API  admin endpoints",
        user:{
            id:req.user._id,
            name:req.user.name,
            role:req.user.role
        }
    });
});


module.exports = router;