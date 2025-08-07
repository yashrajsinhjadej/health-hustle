const User = require('../models/User');
const { 
    convertHeightToCm, 
    convertWeightToKg, 
    isValidHeight, 
    isValidWeight,
    getHeightRangeMessage,
    getWeightRangeMessage,
    getDisplayHeight,
    getDisplayWeight
} = require('../utils/unitConverter');
const ConnectionHelper = require('../utils/connectionHelper');


async function getUserProfile(req, res) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        console.log(`👤 [${requestId}] UserController.getUserProfile START`);
        console.log(`👤 [${requestId}] Request headers:`, req.headers);
        console.log(`👤 [${requestId}] Request IP:`, req.ip || req.connection.remoteAddress);
        
        const user = req.user; // User object is set by authenticateToken middleware
        console.log(`👤 [${requestId}] User from middleware: ${user ? user._id : 'null'}`);
        console.log(`👤 [${requestId}] User profile completed: ${user ? user.profileCompleted : 'N/A'}`);
        
        // Prepare display height and weight if user has completed profile
        let displayHeight = null;
        let displayWeight = null;
        
        if (user.profileCompleted && user.height && user.weight && user.userPreferences) {
            const heightUnit = user.userPreferences.heightUnit || 'cm';
            const weightUnit = user.userPreferences.weightUnit || 'kg';
            
            displayHeight = getDisplayHeight(user.height, heightUnit);
            displayWeight = getDisplayWeight(user.weight, weightUnit);
            
            console.log(`👤 [${requestId}] Display height: ${displayHeight?.display}`);
            console.log(`👤 [${requestId}] Display weight: ${displayWeight?.display}`);
        }
        
        const responseData = {
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
                    height: user.height, // Raw height in cm
                    weight: user.weight, // Raw weight in kg
                    displayHeight: displayHeight, // Height in user's preferred unit
                    displayWeight: displayWeight, // Weight in user's preferred unit
                    loyaltyPercentage: user.loyaltyPercentage,
                    bodyProfile: user.bodyProfile,
                    mainGoal: user.mainGoal,
                    sportsAmbitions: user.sportsAmbitions,
                    activityLevel: user.activityLevel,
                    userPreferences: user.userPreferences
                })
            }
        };
        
        console.log(`👤 [${requestId}] Sending response for user: ${user._id}`);
        res.json(responseData);
    } catch (error) {
        console.error(`👤 [${requestId}] Get user profile error:`, error);
        console.error(`👤 [${requestId}] Error stack:`, error.stack);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}


async function updateUserProfile(req, res) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        console.log(`👤 [${requestId}] UserController.updateUserProfile START`);
        console.log(`👤 [${requestId}] Request body:`, req.body);
        console.log(`👤 [${requestId}] Request headers:`, req.headers);
        console.log(`👤 [${requestId}] Request IP:`, req.ip || req.connection.remoteAddress);
        
        const user = req.user;
        console.log(`👤 [${requestId}] User from middleware: ${user._id}`);
        console.log(`👤 [${requestId}] User profile completed: ${user.profileCompleted}`);

        // Check if profile is already completed
        if (user.profileCompleted === true) {
            console.log(`👤 [${requestId}] Profile already completed for user: ${user._id}`);
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

        console.log(`👤 [${requestId}] Profile data received:`, {
            name, email, gender, height, heightUnit, weight, weightUnit, 
            age, loyaltyPercentage, bodyProfile, mainGoal, sportsAmbitions
        });

        // Convert height and weight to standard units (cm and kg)
        let heightInCm, weightInKg;
        
        try {
            console.log(`👤 [${requestId}] Converting units...`);
            heightInCm = convertHeightToCm(height, heightUnit);
            weightInKg = convertWeightToKg(weight, weightUnit);
            console.log(`👤 [${requestId}] Converted - Height: ${heightInCm}cm, Weight: ${weightInKg}kg`);
        } catch (conversionError) {
            console.error(`👤 [${requestId}] Unit conversion error:`, conversionError);
            return res.status(400).json({
                success: false,
                error: 'Unit conversion failed',
                message: conversionError.message
            });
        }

        // Validate converted values are within acceptable ranges
        if (!isValidHeight(heightInCm)) {
            console.log(`👤 [${requestId}] Invalid height: ${heightInCm}cm`);
            return res.status(400).json({
                success: false,
                error: `Height out of range: ${height} ${heightUnit} (${heightInCm} cm). Must be between ${getHeightRangeMessage(heightUnit)} (50-300 cm equivalent)`,
                validationErrors: {
                    height: `Height must be between ${getHeightRangeMessage(heightUnit)}`
                }
            });
        }

        if (!isValidWeight(weightInKg)) {
            console.log(`👤 [${requestId}] Invalid weight: ${weightInKg}kg`);
            return res.status(400).json({
                success: false,
                error: `Weight out of range: ${weight} ${weightUnit} (${weightInKg} kg). Must be between ${getWeightRangeMessage(weightUnit)} (10-500 kg equivalent)`,
                validationErrors: {
                    weight: `Weight must be between ${getWeightRangeMessage(weightUnit)}`
                }
            });
        }
        
        // Ensure MongoDB connection is ready
        console.log(`👤 [${requestId}] Ensuring MongoDB connection...`);
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

        // Calculate display height and weight for response
        const displayHeight = getDisplayHeight(userUpdated.height, userUpdated.userPreferences.heightUnit);
        const displayWeight = getDisplayWeight(userUpdated.weight, userUpdated.userPreferences.weightUnit);
        
        console.log(`👤 [${requestId}] Display height: ${displayHeight?.display}`);
        console.log(`👤 [${requestId}] Display weight: ${displayWeight?.display}`);

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
                height: userUpdated.height, // Raw height in cm
                weight: userUpdated.weight, // Raw weight in kg
                displayHeight: displayHeight, // Height in user's preferred unit
                displayWeight: displayWeight, // Weight in user's preferred unit
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