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
                email: user.email,
                role: user.role,
                profileCompleted: user.profileCompleted,
                // Include profile data if available
                ...(user.profileCompleted && {
                    age: user.age,
                    gender: user.gender,
                    height: user.height,
                    weight: user.weight,
                    loyaltyPercentage: user.loyaltyPercentage,
                    bodyProfile: user.bodyProfile,
                    mainGoal: user.mainGoal,
                    sportsAmbitions: user.sportsAmbitions,
                    activityLevel: user.activityLevel
                })
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


async function updateUserProfile(req, res) {
    try {
        const user = req.user;

        // Check if profile is already completed
        if (user.profileCompleted === true) {
            return res.status(400).json({
                success: false,
                error: 'Profile already completed. Profile can only be updated once during initial setup.',
                message: 'Your profile has already been set up. Contact support if you need to make changes.'
            });
        }

        const {
            name,
            email,
            gender,
            height,
            weight,
            age,
            loyaltyPercentage,
            bodyProfile,
            mainGoal,
            sportsAmbitions
        } = req.body;

        // Prepare update data with only allowed fields
        const updateData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            gender: gender.toLowerCase(),
            height: height,
            weight: weight,
            age: age,
            loyaltyPercentage: loyaltyPercentage,
            bodyProfile: bodyProfile.toLowerCase(),
            mainGoal: mainGoal.toLowerCase(),
            sportsAmbitions: sportsAmbitions ? sportsAmbitions.map(sport => sport.toLowerCase()) : [],
            profileCompleted: true // Mark profile as completed
        };

        // Update user with validation
        const userUpdated = await User.findByIdAndUpdate(
            user._id, 
            updateData,
            { 
                new: true, // Return updated document
                runValidators: true // Run mongoose validators
            }
        );

        if (!userUpdated) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log(`👤 Profile completed for user ${userUpdated._id} - ${userUpdated.name}`);

        res.json({
            success: true,
            message: 'User profile updated successfully',
            user: {
                id: userUpdated._id,
                name: userUpdated.name,
                phone: userUpdated.phone,
                email: userUpdated.email,
                profileCompleted: userUpdated.profileCompleted,
                age: userUpdated.age,
                gender: userUpdated.gender,
                bodyProfile: userUpdated.bodyProfile,
                mainGoal: userUpdated.mainGoal
            }
        });

    } catch (error) {
        console.error('Update user profile error:', error);
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = {};
            Object.keys(error.errors).forEach(key => {
                validationErrors[key] = error.errors[key].message;
            });
            
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                validationErrors: validationErrors
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}


module.exports = {
    getUserProfile,
    updateUserProfile
};