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
const ResponseHandler = require('../utils/ResponseHandler');


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
                lastLoginAt:user.lastLoginAt,
                signupAt:user.signupAt,
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
                    userPreferences: user.userPreferences,
                   
                })
            }
        };
        
        console.log(`👤 [${requestId}] Sending response for user: ${user._id}`);
        return ResponseHandler.success(res, "Profile retrieved successfully", responseData.user);
    } catch (error) {
        console.error(`👤 [${requestId}] Get user profile error:`, error);
        console.error(`👤 [${requestId}] Error stack:`, error.stack);
        return ResponseHandler.serverError(res, "Failed to retrieve profile");
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
            return ResponseHandler.error(res, "Profile update failed", "Profile already completed. Profile can only be updated once during initial setup.");
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
            return ResponseHandler.error(res, 'Unit conversion failed');
        }

        // Validate converted values are within acceptable ranges
        if (!isValidHeight(heightInCm)) {
            console.log(`👤 [${requestId}] Invalid height: ${heightInCm}cm`);
            return ResponseHandler.error(res, "Invalid height", `Height out of range: ${height} ${heightUnit} (${heightInCm} cm). Must be between ${getHeightRangeMessage(heightUnit)} (50-300 cm equivalent)`);
        }

        if (!isValidWeight(weightInKg)) {
            console.log(`👤 [${requestId}] Invalid weight: ${weightInKg}kg`);
            return ResponseHandler.error(res, "Invalid weight", `Weight out of range: ${weight} ${weightUnit} (${weightInKg} kg). Must be between ${getWeightRangeMessage(weightUnit)} (10-500 kg equivalent)`);
        }
        
        // Ensure MongoDB connection is ready
        console.log(`👤 [${requestId}] Ensuring MongoDB connection...`);
        await ConnectionHelper.ensureConnection();
        console.log(`👤 [${requestId}] MongoDB connection confirmed, preparing update data...`);
        
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

        console.log(`👤 [${requestId}] Update data prepared:`, updateData);
        console.log(`👤 [${requestId}] Starting database update for user: ${user._id}`);

        // Update user with validation and timeout
        const userUpdated = await Promise.race([
            User.findByIdAndUpdate(
                user._id, 
                updateData,
                { 
                    new: true, // Return updated document
                    runValidators: true // Run mongoose validators
                }
            ),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database update timeout after 10 seconds')), 10000)
            )
        ]);

        console.log(`👤 [${requestId}] Database update completed successfully`);

        if (!userUpdated) {
            console.log(`👤 [${requestId}] User not found after update`);
            return ResponseHandler.notFound(res, "User not found");
        }

        console.log(`👤 Profile completed for user ${userUpdated._id} - ${userUpdated.name}`);
        console.log(`📏 Height: ${height} ${heightUnit} → ${heightInCm} cm`);
        console.log(`⚖️ Weight: ${weight} ${weightUnit} → ${weightInKg} kg`);

        // Calculate display height and weight for response
        const displayHeight = getDisplayHeight(userUpdated.height, userUpdated.userPreferences.heightUnit);
        const displayWeight = getDisplayWeight(userUpdated.weight, userUpdated.userPreferences.weightUnit);
        
        console.log(`👤 [${requestId}] Display height: ${displayHeight?.display}`);
        console.log(`👤 [${requestId}] Display weight: ${displayWeight?.display}`);

        return ResponseHandler.success(res, "Profile updated successfully", {
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
                loyaltyPercentage: userUpdated.loyaltyPercentage,
                bodyProfile: userUpdated.bodyProfile,
                mainGoal: userUpdated.mainGoal,
                sportsAmbitions: userUpdated.sportsAmbitions,
                userPreferences: userUpdated.userPreferences
            }
        });

    } catch (error) {
        console.error(`👤 [${requestId}] Update user profile error:`, error);
        console.error(`👤 [${requestId}] Error name: ${error.name}`);
        console.error(`👤 [${requestId}] Error message: ${error.message}`);
        console.error(`👤 [${requestId}] Error stack:`, error.stack);
        
        // Handle specific error types
        if (error.message.includes('timeout')) {
            console.error(`👤 [${requestId}] Database operation timed out`);
            return ResponseHandler.serverError(res, "Database operation timed out. Please try again.");
        }
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            console.error(`👤 [${requestId}] Mongoose validation error:`, error.errors);
            return ResponseHandler.mongooseError(res, error);
        }

        return ResponseHandler.serverError(res, "Failed to update profile");
    }
}


module.exports = {
    getUserProfile,
    updateUserProfile
};