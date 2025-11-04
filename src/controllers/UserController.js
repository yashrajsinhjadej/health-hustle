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
const s3 = require('../services/s3Service');
const dailyHealthData = require('../models/DailyHealthData');
const otp = require('../models/OTP');
const Goals = require('../models/Goals');
const passwordReset = require('../models/PasswordReset');

async function updateUserProfile(req, res) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        console.log(`👤 [${requestId}] UserController.updateUserProfile START`);
        console.log(`👤 [${requestId}] Request body:`, req.body);
        
        const user = req.user;
        console.log(`👤 [${requestId}] User from middleware: ${user._id}`);
        console.log(`👤 [${requestId}] User profile completed: ${user.profileCompleted}`);

        // Check if profile is completed (users can only update after initial setup)
        if (user.profileCompleted !== true) {
            console.log(`👤 [${requestId}] Profile not completed for user: ${user._id}`);
            return ResponseHandler.error(res, "Profile update failed", "Please complete your profile first before updating.");
        }

        const {
            name,
            email,
            gender,
            height,
            heightUnit,
            weight,
            weightUnit,
            age
        } = req.body;

        console.log(`👤 [${requestId}] Profile data received:`, {
            name, email, gender, height, heightUnit, weight, weightUnit, age
        });

        // Prepare update data object (only include fields that are provided)
        const updateData = {};

        // Add provided fields to update data
        if (name !== undefined) {
            updateData.name = name.trim();
        }

        if (email !== undefined) {
            updateData.email = email.toLowerCase().trim();
        }

        if (gender !== undefined) {
            updateData.gender = gender.toLowerCase();
        }

        if (age !== undefined) {
            updateData.age = age;
        }

        // Handle height update
        if (height !== undefined && heightUnit !== undefined) {
            try {
                console.log(`👤 [${requestId}] Converting height...`);
                const heightInCm = convertHeightToCm(height, heightUnit);
                console.log(`👤 [${requestId}] Converted - Height: ${heightInCm}cm`);

                // Validate converted height
                if (!isValidHeight(heightInCm)) {
                    console.log(`👤 [${requestId}] Invalid height: ${heightInCm}cm`);
                    return ResponseHandler.error(res, "Invalid height", 
                        `Height out of range: ${height} ${heightUnit} (${heightInCm} cm). Must be between ${getHeightRangeMessage(heightUnit)} (50-300 cm equivalent)`);
                }

                updateData.height = heightInCm;
                updateData['userPreferences.heightUnit'] = heightUnit;
            } catch (conversionError) {
                console.error(`👤 [${requestId}] Height conversion error:`, conversionError);
                return ResponseHandler.error(res, 'Height conversion failed');
            }
        }

        // Handle weight update
        if (weight !== undefined && weightUnit !== undefined) {
            try {
                console.log(`👤 [${requestId}] Converting weight...`);
                const weightInKg = convertWeightToKg(weight, weightUnit);
                console.log(`👤 [${requestId}] Converted - Weight: ${weightInKg}kg`);

                // Validate converted weight
                if (!isValidWeight(weightInKg)) {
                    console.log(`👤 [${requestId}] Invalid weight: ${weightInKg}kg`);
                    return ResponseHandler.error(res, "Invalid weight", 
                        `Weight out of range: ${weight} ${weightUnit} (${weightInKg} kg). Must be between ${getWeightRangeMessage(weightUnit)} (10-500 kg equivalent)`);
                }

                updateData.weight = weightInKg;
                updateData['userPreferences.weightUnit'] = weightUnit;
            } catch (conversionError) {
                console.error(`👤 [${requestId}] Weight conversion error:`, conversionError);
                return ResponseHandler.error(res, 'Weight conversion failed');
            }
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            console.log(`👤 [${requestId}] No fields to update`);
            return ResponseHandler.error(res, "No update data", "No valid fields provided for update.");
        }

        console.log(`👤 [${requestId}] Update data prepared:`, updateData);

        // Ensure MongoDB connection is ready
        console.log(`👤 [${requestId}] Ensuring MongoDB connection...`);
        await ConnectionHelper.ensureConnection();
        console.log(`👤 [${requestId}] MongoDB connection confirmed, starting database update...`);

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

        console.log(`👤 Profile updated for user ${userUpdated._id} - ${userUpdated.name}`);
        if (updateData.height) {
            console.log(`📏 Height updated: ${height} ${heightUnit} → ${updateData.height} cm`);
        }
        if (updateData.weight) {
            console.log(`⚖️ Weight updated: ${weight} ${weightUnit} → ${updateData.weight} kg`);
        }

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
                profilePictureUrl: userUpdated.profilePictureUrl || null,
                age: userUpdated.age,
                gender: userUpdated.gender,
                height: userUpdated.height, // Raw height in cm
                weight: userUpdated.weight, // Raw weight in kg
                displayHeight: displayHeight, // Height in user's preferred unit
                displayWeight: displayWeight, // Weight in user's preferred unit
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

        // Handle duplicate key errors (email/phone already exists)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            console.error(`👤 [${requestId}] Duplicate key error for field: ${field}`);
            return ResponseHandler.error(res, "Update failed", `This ${field} is already in use.`);
        }

        return ResponseHandler.serverError(res, "Failed to update profile");
    }
}


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
                profilePictureUrl: user.profilePictureUrl || null,
                lastLoginAt: user.lastLoginAt,
                signupAt: user.signupAt,
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


async function updateFirstTimeProfile(req, res) {
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
                profilePictureUrl: userUpdated.profilePictureUrl || null,
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

const deleteUserAccount = async (req, res) => {
  const userId = req.user?._id;
  try {
    if (!userId) {
      return ResponseHandler.unauthorized(res, "Authentication required");
    }

    // Delete user
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return ResponseHandler.error(res, "Not found", "User account does not exist", 404);
    }

    // Best-effort cascade deletes (do not block success)
    try {
      await dailyHealthData.deleteMany({ user: userId });
      await otp.deleteMany({ user: userId });
      await passwordReset.deleteMany({ user: userId });
      await Goals.deleteMany({ user: userId });
    } catch (cascadeErr) {
      console.warn("Cascade delete warning:", cascadeErr);
    }

    return ResponseHandler.success(res, "User account deleted successfully");
  } catch (error) {
    console.error("Error deleting user account:", error);

    if (error?.name === "CastError") {
      return ResponseHandler.error(res, "Invalid request", "Invalid user ID format", 400);
    }

    return ResponseHandler.serverError(res, "Failed to delete user account");
  }
};


const addProfilePicture = async (req, res) => {
    const userId = req.user?._id;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        console.log(`🖼️ [${requestId}] UserController.addProfilePicture START`);
        console.log(`🖼️ [${requestId}] User ID: ${userId}`);

        // -----------------------------
        // 1️⃣ Validate file upload
        // -----------------------------
        if (!req.file) {
            console.log(`🖼️ [${requestId}] No file uploaded`);
            return ResponseHandler.badRequest(res, 'Profile picture is required');
        }

        const file = req.file;
        console.log(`🖼️ [${requestId}] File received:`, {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });

        // -----------------------------
        // 2️⃣ Get user from database
        // -----------------------------
        const user = await User.findById(userId);
        if (!user) {
            console.log(`🖼️ [${requestId}] User not found: ${userId}`);
            return ResponseHandler.notFound(res, 'User not found');
        }

        // -----------------------------
        // 3️⃣ Upload new profile picture to S3
        // -----------------------------
        console.log(`🖼️ [${requestId}] Uploading to S3...`);
        const uploadResult = await s3.uploadToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            {
                keyPrefix: 'users/profile-pictures/',
                cacheControl: 'public, max-age=31536000, immutable',
                contentDisposition: 'inline',
            }
        );

        console.log(`🖼️ [${requestId}] S3 upload successful:`, {
            key: uploadResult.key,
            url: uploadResult.url
        });

        // -----------------------------
        // 4️⃣ Delete old profile picture if exists
        // -----------------------------
        if (user.profilePictureKey) {
            console.log(`🖼️ [${requestId}] Deleting old profile picture from S3...`);
            try {
                await s3.deleteFromS3(user.profilePictureKey);
                console.log(`🖼️ [${requestId}] ✅ Old profile picture deleted:`, user.profilePictureKey);
            } catch (deleteErr) {
                console.warn(`🖼️ [${requestId}] ⚠️ Failed to delete old profile picture:`, deleteErr.message);
                // Continue anyway - don't block upload
            }
        } else {
            console.log(`🖼️ [${requestId}] No existing profile picture to delete`);
        }

        // -----------------------------
        // 5️⃣ Update user with new profile picture
        // -----------------------------
        user.profilePictureUrl = uploadResult.url || s3.getS3PublicUrl(uploadResult.key);
        user.profilePictureKey = uploadResult.key;
        await user.save();

        console.log(`🖼️ [${requestId}] ✅ Profile picture updated successfully`);

        return ResponseHandler.success(res, "Profile picture updated successfully", {
            profilePictureUrl: user.profilePictureUrl
        });
    } catch (error) {
        console.error(`🖼️ [${requestId}] ❌ Error adding profile picture:`, error);
        return ResponseHandler.serverError(res, "Failed to update profile picture");
    }
};

const deleteProfilePicture = async (req, res) => {
    const userId = req.user?._id;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        console.log(`🗑️ [${requestId}] UserController.deleteProfilePicture START`);
        console.log(`🗑️ [${requestId}] User ID: ${userId}`);

        // -----------------------------
        // 1️⃣ Get user from database
        // -----------------------------
        const user = await User.findById(userId);
        if (!user) {
            console.log(`🗑️ [${requestId}] User not found: ${userId}`);
            return ResponseHandler.notFound(res, 'User not found');
        }

        // -----------------------------
        // 2️⃣ Check if user has a profile picture
        // -----------------------------
        if (!user.profilePictureKey && !user.profilePictureUrl) {
            console.log(`🗑️ [${requestId}] No profile picture to delete`);
            return ResponseHandler.error(res, 'No profile picture', 'User does not have a profile picture', 400);
        }

        // -----------------------------
        // 3️⃣ Delete profile picture from S3
        // -----------------------------
        if (user.profilePictureKey) {
            console.log(`🗑️ [${requestId}] Deleting profile picture from S3:`, user.profilePictureKey);
            try {
                await s3.deleteFromS3(user.profilePictureKey);
                console.log(`🗑️ [${requestId}] ✅ Profile picture deleted from S3`);
            } catch (deleteErr) {
                console.error(`🗑️ [${requestId}] ❌ Failed to delete from S3:`, deleteErr.message);
                // Continue to update database even if S3 deletion fails
            }
        } else {
            console.log(`🗑️ [${requestId}] No S3 key found, skipping S3 deletion`);
        }

        // -----------------------------
        // 4️⃣ Update user - remove profile picture references
        // -----------------------------
        user.profilePictureUrl = null;
        user.profilePictureKey = null;
        await user.save();

        console.log(`🗑️ [${requestId}] ✅ Profile picture removed from user record`);

        return ResponseHandler.success(res, "Profile picture deleted successfully", {
            profilePictureUrl: null
        });
    } catch (error) {
        console.error(`🗑️ [${requestId}] ❌ Error deleting profile picture:`, error);
        return ResponseHandler.serverError(res, "Failed to delete profile picture");
    }
};

module.exports = {
    getUserProfile,
    updateFirstTimeProfile,
    deleteUserAccount,
    addProfilePicture,
    deleteProfilePicture,
    updateUserProfile
};