const User = require('../models/User');


async function getUserProfile(req, res) {
    try {
        const user = req.user; // User object is set by authenticateToken middleware
        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}


async function updateUserProfile(req,res){
    try{
       const user = req.user;
       const updateData = req.body;
       const userUpdated = await User.findByIdAndUpdate(user._id, updateData);
       res.send({
           success: true,
           message: 'User profile updated successfully',
           user: {
               id: userUpdated._id,
               name: userUpdated.name,
               phone: userUpdated.phone,

           }
       });
    }
    catch{
        res.send({
            success: false,
            error: 'Internal server error'
        });
    }
}


module.exports = {
    getUserProfile,
    updateUserProfile
};