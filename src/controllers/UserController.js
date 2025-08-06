const User = require('../models/User');
const { 
    convertHeightToCm, 
    convertWeightToKg, 
    isValidHeight, 
    isValidWeight,
    getHeightRangeMessage,
    getWeightRangeMessage
} = require('../utils/unitConverter');
const ConnectionHelper = require('../utils/connectionHelper');


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
                    activityLevel: user.activityLevel,
                    userPreferences: user.userPreferences
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
            heightUnit,
            weight,
            weightUnit,
            age,
            loyaltyPercentage,
            bodyProfile,
            mainGoal,
            sportsAmbitions
        } = req.body;

        // Convert height and weight to standard units (cm and kg)
        let heightInCm, weightInKg;
        
        try {
            heightInCm = convertHeightToCm(height, heightUnit);
            weightInKg = convertWeightToKg(weight, weightUnit);
        } catch (conversionError) {
            return res.status(400).json({
                success: false,
                error: 'Unit conversion failed',
                message: conversionError.message
            });
        }

        // Validate converted values are within acceptable ranges
        if (!isValidHeight(heightInCm)) {
            return res.status(400).json({
                success: false,
                error: `Height out of range: ${height} ${heightUnit} (${heightInCm} cm). Must be between ${getHeightRangeMessage(heightUnit)} (50-300 cm equivalent)`,
                validationErrors: {
                    height: `Height must be between ${getHeightRangeMessage(heightUnit)}`
                }
            });
        }

        if (!isValidWeight(weightInKg)) {
            return res.status(400).json({
                success: false,
                error: `Weight out of range: ${weight} ${weightUnit} (${weightInKg} kg). Must be between ${getWeightRangeMessage(weightUnit)} (10-500 kg equivalent)`,
                validationErrors: {
                    weight: `Weight must be between ${getWeightRangeMessage(weightUnit)}`
                }
            });
        }
        
        // Ensure MongoDB connection is ready
        await ConnectionHelper.ensureConnection();
        
        // Prepare update data with converted values
        const updateData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            gender: gender.toLowerCase(),
            height: heightInCm, // Store in cm
            weight: weightInKg, // Store in kg
            age: age,
            loyaltyPercentage: loyaltyPercentage,
            bodyProfile: bodyProfile.toLowerCase(),
            mainGoal: mainGoal.toLowerCase(),
            sportsAmbitions: sportsAmbitions ? sportsAmbitions.map(sport => sport.toLowerCase()) : [],
            userPreferences: {
                heightUnit: heightUnit,
                weightUnit: weightUnit
            },
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
        console.log(`📏 Height: ${height} ${heightUnit} → ${heightInCm} cm`);
        console.log(`⚖️ Weight: ${weight} ${weightUnit} → ${weightInKg} kg`);

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
                height: userUpdated.height,
                weight: userUpdated.weight,
                bodyProfile: userUpdated.bodyProfile,
                mainGoal: userUpdated.mainGoal,
                userPreferences: userUpdated.userPreferences
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