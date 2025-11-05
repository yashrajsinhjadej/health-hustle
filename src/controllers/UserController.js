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
const Logger = require('../utils/logger');

const s3 = require('../services/s3Service')
const dailyHealthData = require('../models/DailyHealthData');
const otp = require('../models/OTP');
const Goals = require('../models/Goals');
const passwordReset = require('../models/PasswordReset');

async function updateUserProfile(req, res) {
    const requestId = `user-update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        Logger.info('updateUserProfile START', requestId, { bodyKeys: Object.keys(req.body) });
        
        const user = req.user;
        Logger.info('User from auth middleware', requestId, { 
            userId: user._id, 
            profileCompleted: user.profileCompleted 
        });

        // Check if profile is completed (users can only update after initial setup)
        if (user.profileCompleted !== true) {
            Logger.warn('Profile update blocked - profile not completed', requestId, { userId: user._id });
            return ResponseHandler.error(
                res, 
                "Profile update failed", 
                "Please complete your profile first before updating.",
                400,
                'USER_PROFILE_NOT_COMPLETED'
            );
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

        Logger.info('Profile data received', requestId, { 
            name: !!name, 
            email: !!email, 
            gender: !!gender, 
            hasHeight: !!height, 
            hasWeight: !!weight 
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
                Logger.info('Converting height', requestId, { height, heightUnit });
                const heightInCm = convertHeightToCm(height, heightUnit);
                Logger.info('Height converted', requestId, { heightInCm });

                // Validate converted height
                if (!isValidHeight(heightInCm)) {
                    Logger.warn('Invalid height detected', requestId, { heightInCm });
                    return ResponseHandler.error(
                        res, 
                        "Invalid height", 
                        `Height out of range: ${height} ${heightUnit} (${heightInCm} cm). Must be between ${getHeightRangeMessage(heightUnit)} (50-300 cm equivalent)`,
                        400,
                        'USER_INVALID_HEIGHT'
                    );
                }

                updateData.height = heightInCm;
                updateData['userPreferences.heightUnit'] = heightUnit;
            } catch (conversionError) {
                Logger.error('Height conversion error', requestId, { error: conversionError.message });
                return ResponseHandler.error(
                    res, 
                    'Height conversion failed',
                    'Unable to convert height to standard units',
                    400,
                    'USER_HEIGHT_CONVERSION_FAILED'
                );
            }
        }

        // Handle weight update
        if (weight !== undefined && weightUnit !== undefined) {
            try {
                Logger.info('Converting weight', requestId, { weight, weightUnit });
                const weightInKg = convertWeightToKg(weight, weightUnit);
                Logger.info('Weight converted', requestId, { weightInKg });

                // Validate converted weight
                if (!isValidWeight(weightInKg)) {
                    Logger.warn('Invalid weight detected', requestId, { weightInKg });
                    return ResponseHandler.error(
                        res, 
                        "Invalid weight", 
                        `Weight out of range: ${weight} ${weightUnit} (${weightInKg} kg). Must be between ${getWeightRangeMessage(weightUnit)} (10-500 kg equivalent)`,
                        400,
                        'USER_INVALID_WEIGHT'
                    );
                }

                updateData.weight = weightInKg;
                updateData['userPreferences.weightUnit'] = weightUnit;
            } catch (conversionError) {
                Logger.error('Weight conversion error', requestId, { error: conversionError.message });
                return ResponseHandler.error(
                    res, 
                    'Weight conversion failed',
                    'Unable to convert weight to standard units',
                    400,
                    'USER_WEIGHT_CONVERSION_FAILED'
                );
            }
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            Logger.warn('No fields to update', requestId);
            return ResponseHandler.error(
                res, 
                "No update data", 
                "No valid fields provided for update.",
                400,
                'USER_NO_UPDATE_DATA'
            );
        }

        Logger.info('Update data prepared', requestId, { fieldCount: Object.keys(updateData).length });

        // Ensure MongoDB connection is ready
        Logger.info('Ensuring MongoDB connection', requestId);
        await ConnectionHelper.ensureConnection();
        Logger.info('MongoDB connection confirmed', requestId);

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

        Logger.info('Database update completed', requestId);

        if (!userUpdated) {
            Logger.error('User not found after update', requestId, { userId: user._id });
            return ResponseHandler.notFound(res, "User not found", 'USER_NOT_FOUND');
        }

        Logger.info('Profile updated successfully', requestId, { 
            userId: userUpdated._id, 
            name: userUpdated.name 
        });

        // Calculate display height and weight for response
        const displayHeight = getDisplayHeight(userUpdated.height, userUpdated.userPreferences.heightUnit);
        const displayWeight = getDisplayWeight(userUpdated.weight, userUpdated.userPreferences.weightUnit);
        
        Logger.info('Profile response prepared', requestId, { 
            displayHeight: displayHeight?.display, 
            displayWeight: displayWeight?.display 
        });

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
        Logger.error('Update user profile error', requestId, { 
            errorName: error.name, 
            errorMessage: error.message 
        });
        
        // Handle specific error types
        if (error.message.includes('timeout')) {
            Logger.error('Database operation timed out', requestId);
            return ResponseHandler.serverError(
                res, 
                "Database operation timed out. Please try again.",
                'USER_UPDATE_TIMEOUT'
            );
        }
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            Logger.error('Mongoose validation error', requestId, { errors: error.errors });
            return ResponseHandler.mongooseError(res, error, 'USER_VALIDATION_ERROR');
        }

        // Handle duplicate key errors (email/phone already exists)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            Logger.error('Duplicate key error', requestId, { field });
            return ResponseHandler.error(
                res, 
                "Update failed", 
                `This ${field} is already in use.`,
                400,
                'USER_DUPLICATE_FIELD'
            );
        }

        return ResponseHandler.serverError(res, "Failed to update profile", 'USER_UPDATE_FAILED');
    }
}


async function getUserProfile(req, res) {
    const requestId = `user-profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        Logger.info('getUserProfile START', requestId, { ip: req.ip || req.connection.remoteAddress });
        
        const user = req.user; // User object is set by authenticateToken middleware
        Logger.info('User from auth middleware', requestId, { 
            userId: user ? user._id : 'null', 
            profileCompleted: user ? user.profileCompleted : 'N/A' 
        });
        
        // Prepare display height and weight if user has completed profile
        let displayHeight = null;
        let displayWeight = null;
        
        if (user.profileCompleted && user.height && user.weight && user.userPreferences) {
            const heightUnit = user.userPreferences.heightUnit || 'cm';
            const weightUnit = user.userPreferences.weightUnit || 'kg';
            
            displayHeight = getDisplayHeight(user.height, heightUnit);
            displayWeight = getDisplayWeight(user.weight, weightUnit);
            
            Logger.info('Display units calculated', requestId, { 
                displayHeight: displayHeight?.display, 
                displayWeight: displayWeight?.display 
            });
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
        
        Logger.info('Profile retrieved successfully', requestId, { userId: user._id });
        return ResponseHandler.success(res, "Profile retrieved successfully", responseData.user);
    } catch (error) {
        Logger.error('Get user profile error', requestId, { 
            errorName: error.name, 
            errorMessage: error.message 
        });
        return ResponseHandler.serverError(res, "Failed to retrieve profile", 'USER_PROFILE_FETCH_FAILED');
    }
}


async function updateFirstTimeProfile(req, res) {
    const requestId = `user-firsttime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        Logger.info('updateFirstTimeProfile START', requestId, { 
            bodyKeys: Object.keys(req.body),
            ip: req.ip || req.connection.remoteAddress 
        });
        
        const user = req.user;
        Logger.info('User from auth middleware', requestId, { 
            userId: user._id, 
            profileCompleted: user.profileCompleted 
        });

        // Check if profile is already completed
        if (user.profileCompleted === true) {
            Logger.warn('Profile already completed', requestId, { userId: user._id });
            return ResponseHandler.error(
                res, 
                "Profile update failed", 
                "Profile already completed. Profile can only be updated once during initial setup.",
                400,
                'USER_PROFILE_ALREADY_COMPLETED'
            );
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

        Logger.info('Profile data received', requestId, { 
            hasName: !!name, 
            hasEmail: !!email, 
            gender, 
            heightUnit, 
            weightUnit 
        });

        // Convert height and weight to standard units (cm and kg)
        let heightInCm, weightInKg;
        
        try {
            Logger.info('Converting units', requestId, { height, heightUnit, weight, weightUnit });
            heightInCm = convertHeightToCm(height, heightUnit);
            weightInKg = convertWeightToKg(weight, weightUnit);
            Logger.info('Units converted successfully', requestId, { heightInCm, weightInKg });
        } catch (conversionError) {
            Logger.error('Unit conversion error', requestId, { error: conversionError.message });
            return ResponseHandler.error(
                res, 
                'Unit conversion failed',
                'Unable to convert height or weight to standard units',
                400,
                'USER_UNIT_CONVERSION_FAILED'
            );
        }

        // Validate converted values are within acceptable ranges
        if (!isValidHeight(heightInCm)) {
            Logger.warn('Invalid height detected', requestId, { heightInCm });
            return ResponseHandler.error(
                res, 
                "Invalid height", 
                `Height out of range: ${height} ${heightUnit} (${heightInCm} cm). Must be between ${getHeightRangeMessage(heightUnit)} (50-300 cm equivalent)`,
                400,
                'USER_INVALID_HEIGHT'
            );
        }

        if (!isValidWeight(weightInKg)) {
            Logger.warn('Invalid weight detected', requestId, { weightInKg });
            return ResponseHandler.error(
                res, 
                "Invalid weight", 
                `Weight out of range: ${weight} ${weightUnit} (${weightInKg} kg). Must be between ${getWeightRangeMessage(weightUnit)} (10-500 kg equivalent)`,
                400,
                'USER_INVALID_WEIGHT'
            );
        }
        
        // Ensure MongoDB connection is ready
        Logger.info('Ensuring MongoDB connection', requestId);
        await ConnectionHelper.ensureConnection();
        Logger.info('MongoDB connection confirmed', requestId);
        
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

        Logger.info('Update data prepared', requestId, { profileCompleted: true });

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

        Logger.info('Database update completed', requestId);

        if (!userUpdated) {
            Logger.error('User not found after update', requestId, { userId: user._id });
            return ResponseHandler.notFound(res, "User not found", 'USER_NOT_FOUND');
        }

        Logger.info('Profile completed successfully', requestId, { 
            userId: userUpdated._id, 
            name: userUpdated.name 
        });

        // Calculate display height and weight for response
        const displayHeight = getDisplayHeight(userUpdated.height, userUpdated.userPreferences.heightUnit);
        const displayWeight = getDisplayWeight(userUpdated.weight, userUpdated.userPreferences.weightUnit);
        
        Logger.info('Profile response prepared', requestId, { 
            displayHeight: displayHeight?.display, 
            displayWeight: displayWeight?.display 
        });

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
        Logger.error('Update first time profile error', requestId, { 
            errorName: error.name, 
            errorMessage: error.message 
        });
        
        // Handle specific error types
        if (error.message.includes('timeout')) {
            Logger.error('Database operation timed out', requestId);
            return ResponseHandler.serverError(
                res, 
                "Database operation timed out. Please try again.",
                'USER_UPDATE_TIMEOUT'
            );
        }
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            Logger.error('Mongoose validation error', requestId, { errors: error.errors });
            return ResponseHandler.mongooseError(res, error, 'USER_VALIDATION_ERROR');
        }

        return ResponseHandler.serverError(res, "Failed to update profile", 'USER_FIRSTTIME_UPDATE_FAILED');
    }
}

const deleteUserAccount = async (req, res) => {
  const userId = req.user?._id;
  const requestId = `user-delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    Logger.info('deleteUserAccount START', requestId, { userId: userId || 'none' });
    
    if (!userId) {
      Logger.warn('User ID not found in request', requestId);
      return ResponseHandler.unauthorized(res, "Authentication required", 'USER_AUTH_REQUIRED');
    }

    // Delete user
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      Logger.warn('User not found for deletion', requestId, { userId });
      return ResponseHandler.error(
        res, 
        "Not found", 
        "User account does not exist", 
        404,
        'USER_NOT_FOUND'
      );
    }

    Logger.info('User account deleted', requestId, { userId, name: deletedUser.name });

    // Best-effort cascade deletes (do not block success)
    try {
      await dailyHealthData.deleteMany({ user: userId });
      await otp.deleteMany({ user: userId });
      await passwordReset.deleteMany({ user: userId });
      await Goals.deleteMany({ user: userId });
      Logger.info('Cascade delete completed', requestId, { userId });
    } catch (cascadeErr) {
      Logger.warn('Cascade delete warning', requestId, { error: cascadeErr.message });
    }

    return ResponseHandler.success(res, "User account deleted successfully");
  } catch (error) {
    Logger.error('Delete user account error', requestId, { 
      errorName: error?.name, 
      errorMessage: error?.message 
    });

    if (error?.name === "CastError") {
      Logger.warn('Invalid user ID format', requestId);
      return ResponseHandler.error(
        res, 
        "Invalid request", 
        "Invalid user ID format", 
        400,
        'USER_INVALID_ID'
      );
    }

    return ResponseHandler.serverError(res, "Failed to delete user account", 'USER_DELETE_FAILED');
  }
};


const addProfilePicture = async (req, res) => {
    const userId = req.user?._id;
    const requestId = `user-addpic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        Logger.info('addProfilePicture START', requestId, { userId });

        // Validate file upload
        if (!req.file) {
            Logger.warn('No file uploaded', requestId);
            return ResponseHandler.badRequest(res, 'Profile picture is required', 'USER_NO_FILE_UPLOADED');
        }

        const file = req.file;
        Logger.info('File received', requestId, { 
            originalname: file.originalname, 
            mimetype: file.mimetype, 
            size: file.size 
        });

        // Get user from database
        const user = await User.findById(userId);
        if (!user) {
            Logger.warn('User not found', requestId, { userId });
            return ResponseHandler.notFound(res, 'User not found', 'USER_NOT_FOUND');
        }

        // Upload new profile picture to S3
        Logger.info('Uploading to S3', requestId);
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

        Logger.info('S3 upload successful', requestId, { 
            key: uploadResult.key, 
            url: uploadResult.url 
        });

        // Delete old profile picture if exists
        if (user.profilePictureKey) {
            Logger.info('Deleting old profile picture from S3', requestId, { 
                key: user.profilePictureKey 
            });
            try {
                await s3.deleteFromS3(user.profilePictureKey);
                Logger.info('Old profile picture deleted', requestId);
            } catch (deleteErr) {
                Logger.warn('Failed to delete old profile picture', requestId, { 
                    error: deleteErr.message 
                });
                // Continue anyway - don't block upload
            }
        } else {
            Logger.info('No existing profile picture to delete', requestId);
        }

        // Update user with new profile picture
        user.profilePictureUrl = uploadResult.url || s3.getS3PublicUrl(uploadResult.key);
        user.profilePictureKey = uploadResult.key;
        await user.save();

        Logger.info('Profile picture updated successfully', requestId);

        return ResponseHandler.success(res, "Profile picture updated successfully", {
            profilePictureUrl: user.profilePictureUrl
        });
    } catch (error) {
        Logger.error('Error adding profile picture', requestId, { 
            errorName: error.name, 
            errorMessage: error.message 
        });
        return ResponseHandler.serverError(res, "Failed to update profile picture", 'USER_UPLOAD_FAILED');
    }
};

const deleteProfilePicture = async (req, res) => {
    const userId = req.user?._id;
    const requestId = `user-delpic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        Logger.info('deleteProfilePicture START', requestId, { userId });

        // Get user from database
        const user = await User.findById(userId);
        if (!user) {
            Logger.warn('User not found', requestId, { userId });
            return ResponseHandler.notFound(res, 'User not found', 'USER_NOT_FOUND');
        }

        // Check if user has a profile picture
        if (!user.profilePictureKey && !user.profilePictureUrl) {
            Logger.warn('No profile picture to delete', requestId, { userId });
            return ResponseHandler.error(
                res, 
                'No profile picture', 
                'User does not have a profile picture', 
                400,
                'USER_NO_PROFILE_PICTURE'
            );
        }

        // Delete profile picture from S3
        if (user.profilePictureKey) {
            Logger.info('Deleting profile picture from S3', requestId, { 
                key: user.profilePictureKey 
            });
            try {
                await s3.deleteFromS3(user.profilePictureKey);
                Logger.info('Profile picture deleted from S3', requestId);
            } catch (deleteErr) {
                Logger.error('Failed to delete from S3', requestId, { 
                    error: deleteErr.message 
                });
                // Continue to update database even if S3 deletion fails
            }
        } else {
            Logger.info('No S3 key found, skipping S3 deletion', requestId);
        }

        // Update user - remove profile picture references
        user.profilePictureUrl = null;
        user.profilePictureKey = null;
        await user.save();

        Logger.info('Profile picture removed from user record', requestId);

        return ResponseHandler.success(res, "Profile picture deleted successfully", {
            profilePictureUrl: null
        });
    } catch (error) {
        Logger.error('Error deleting profile picture', requestId, { 
            errorName: error.name, 
            errorMessage: error.message 
        });
        return ResponseHandler.serverError(res, "Failed to delete profile picture", 'USER_DELETE_PICTURE_FAILED');
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