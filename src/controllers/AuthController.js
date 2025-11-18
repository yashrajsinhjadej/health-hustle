// Authentication Controller
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const OTPUtils = require('../utils/otpUtils');
const OTPService = require('../services/otpService');
const ConnectionHelper = require('../utils/connectionHelper');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');
const redis = require('../utils/redisClient');


class AuthController {

    // Send OTP to phone number
async sendOTP(req, res) {
        const requestId = Logger.generateId('auth-send-otp');
        
        try {
            Logger.info(requestId, '📱 AuthController.sendOTP - Request started');
            Logger.logRequest(requestId, req);
            
            const { phone } = req.body;
            Logger.debug(requestId, `Extracted phone number`, { phone, type: typeof phone });

            Logger.info(requestId, 'Finding user is inactive or not in the db before sending OTP', { phone });
            const user = await User.findOne({ phone: OTPUtils.cleanPhoneNumber(phone) }).select('isActive');
            if (user && !user.isActive) {
                Logger.warn(requestId, 'Attempt to send OTP to inactive user', { phone });
                return ResponseHandler.error(res, 'User account is inactive. Please contact support.', 'AUTH_USER_INACTIVE', 403);
            }

            // Use service for complete OTP workflow
            Logger.info(requestId, 'Calling OTPService.sendOTP');
            const result = await OTPService.sendOTP(phone);
            Logger.debug(requestId, 'OTPService.sendOTP result received', { success: result.success });
            
            if (!result.success) {
                Logger.warn(requestId, 'OTP sending failed', { message: result.message, phone });
                
                if (result.waitTime) {
                    return ResponseHandler.rateLimitError(res, result.waitTime);
                }
                
                return ResponseHandler.error(res, result.message, result.error, 400, result.code);
            }

            Logger.success(requestId, `OTP sent successfully`, { phone });
            
            // Include OTP in response for testing/debugging
            const responseData = {
                messageId: result.messageId,
                otp: result.otp
            };
            
            return ResponseHandler.success(res, "OTP sent successfully", responseData);

        } catch (error) {
            Logger.error(requestId, 'Send OTP error', { 
                error: error.message, 
                stack: error.stack,
                phone: req.body?.phone 
            });
            return ResponseHandler.serverError(res, "Failed to send OTP");
        }
}

async verifyOTP(req, res) {
    const requestId = Logger.generateId('auth-verify-otp');

    try {
        Logger.info(requestId, '🔐 AuthController.verifyOTP - Request started');
        Logger.logRequest(requestId, req);

        const { phone, otp } = req.body;
        Logger.debug(requestId, 'Extracted credentials', { phone, otp: '***' });

        // 1️⃣ Verify OTP
        const verificationResult = await OTPService.verifyOTP(phone, otp);
        if (!verificationResult.success) {
            return ResponseHandler.error(
                res,
                verificationResult.message,
                verificationResult.error,
                400,
                verificationResult.code
            );
        }

        const cleanPhone = OTPUtils.cleanPhoneNumber(phone);
        await ConnectionHelper.ensureConnection();

        // 2️⃣ Find/Create user
        let user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            user = new User({
                name: 'New User',
                phone: cleanPhone,
                role: 'user',
                profileCompleted: false,
                signupAt: new Date()
            });
            await user.save();
        }

        // 3️⃣ Create new session ID
        const sessionId = uuidv4();

        // 4️⃣ Generate JWT (with sessionId + role)
        const token = jwt.sign(
            {
                userId: user._id.toString(),
                role: "user",
                sessionId
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

       await redis.set(
        `session:user:${user._id}`,
        sessionId,
        { EX: parseInt(process.env.REDIS_SESSION_TTL) }
        );
        Logger.success(requestId, 'User login successful', {
            userId: user._id,
            profileCompleted: user.profileCompleted
        });

        // 6️⃣ Send token back
        res.set('Authorization', `Bearer ${token}`);

        return ResponseHandler.success(res, "Login successful", {
            token,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                role: user.role,
                profileCompleted: user.profileCompleted
            }
        });

    } catch (error) {
        Logger.error(requestId, 'Verify OTP error', {
            error: error.message,
            stack: error.stack
        });
        return ResponseHandler.serverError(res, "Authentication failed");
    }
}

    // Get current user profile
async getProfile(req, res) {
        const requestId = Logger.generateId('auth-profile');
        
        try {
            Logger.info(requestId, 'Fetching user profile', { userId: req.user._id });
            
            // req.user is populated by the authenticateToken middleware
            return ResponseHandler.success(res, "Profile fetched successfully", {
                user: {
                    id: req.user._id,
                    name: req.user.name,
                    phone: req.user.phone,
                    role: req.user.role,
                    createdAt: req.user.createdAt
                }
            });
        } catch (error) {
            Logger.error(requestId, 'Get profile error', { 
                error: error.message, 
                stack: error.stack,
                userId: req.user?._id 
            });
            return ResponseHandler.serverError(res, "Failed to fetch profile");
        }
}

    // Update user profile
async updateProfile(req, res) {
        try {
            const user = req.user;
            const updateData = {};
            let hasUpdates = false;

            // Extract and validate fields from request body
            const { name, email, dateOfBirth, gender, height, weight, fitnessGoal } = req.body;

            // Update name if provided
            if (name && name.trim() !== '' && name !== 'New User') {
                const trimmedName = name.trim();
                
                // Validate name format - should contain at least one letter
                const nameRegex = /^[a-zA-Z\s\-\.\']+$/; // Allow letters, spaces, hyphens, dots, apostrophes
                const hasLetter = /[a-zA-Z]/.test(trimmedName); // Must contain at least one letter
                
                if (!nameRegex.test(trimmedName)) {
                    return res.status(400).json({
                        success: false,
                        message: "Validation failed",
                        details: "Name can only contain letters, spaces, hyphens, dots, and apostrophes"
                    });
                }
                
                if (!hasLetter) {
                    return res.status(400).json({
                        success: false,
                        message: "Validation failed",
                        details: "Name must contain at least one letter"
                    });
                }
                
                if (trimmedName.length < 2) {
                    return res.status(400).json({
                        success: false,
                        message: "Validation failed",
                        details: "Name must be at least 2 characters long"
                    });
                }
                
                if (trimmedName.length > 50) {
                    return res.status(400).json({
                        success: false,
                        message: "Validation failed",
                        details: "Name must be less than 50 characters"
                    });
                }
                
                updateData.name = trimmedName;
                hasUpdates = true;
            }

            // Update email if provided (add validation later)
            if (email && email.trim() !== '') {
                updateData.email = email.trim().toLowerCase();
                hasUpdates = true;
            }

            // Update date of birth if provided
            if (dateOfBirth) {
                updateData.dateOfBirth = new Date(dateOfBirth);
                hasUpdates = true;
            }

            // Update gender if provided
            if (gender && ['male', 'female', 'other'].includes(gender.toLowerCase())) {
                updateData.gender = gender.toLowerCase();
                hasUpdates = true;
            }

            // Update height if provided (in cm)
            if (height && !isNaN(height) && height > 0) {
                updateData.height = parseFloat(height);
                hasUpdates = true;
            }

            // Update weight if provided (in kg)
            if (weight && !isNaN(weight) && weight > 0) {
                updateData.weight = parseFloat(weight);
                hasUpdates = true;
            }

            // Update fitness goal if provided
            if (fitnessGoal && fitnessGoal.trim() !== '') {
                updateData.fitnessGoal = fitnessGoal.trim();
                hasUpdates = true;
            }

            // Check if any updates were provided
            if (!hasUpdates) {
                return ResponseHandler.error(res, "Update failed", "No valid fields provided for update");
            }

            // Mark profile as completed if name is being updated
            if (updateData.name) {
                updateData.profileCompleted = true;
            }

            // Update user in database
            Object.assign(user, updateData);
            await user.save();

            Logger.success('auth-update-profile', `Profile updated successfully`, { 
                userId: user._id,
                phone: user.phone,
                updatedFields: Object.keys(updateData) 
            });

            return ResponseHandler.success(res, "Profile updated successfully", {
                user: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
                    email: user.email,
                    dateOfBirth: user.dateOfBirth,
                    gender: user.gender,
                    height: user.height,
                    weight: user.weight,
                    fitnessGoal: user.fitnessGoal,
                    role: user.role,
                    profileCompleted: user.profileCompleted
                }
            });

        } catch (error) {
            Logger.error('auth-update-profile', 'Update profile error', { 
                error: error.message, 
                stack: error.stack,
                userId: req.user?._id 
            });
            return ResponseHandler.serverError(res, "Failed to update profile");
        }
}

    async logout(req, res) {
    const requestId = Logger.generateId('auth-logout');

    try {
        const user = req.user;              // mongoose document
        const userId = user._id.toString(); 
        const { role, sessionId } = req.session;

        Logger.info(requestId, 'User logout initiated', {
            userId,
            role,
            sessionId
        });

        // ❌ Admin logout is not allowed
        if (role !== "user") {
            return ResponseHandler.forbidden(
                res,
                "Admins cannot logout from this endpoint",
                "ADMIN_LOGOUT_NOT_ALLOWED"
            );
        }

        // 1️⃣ Ensure DB connected
        await ConnectionHelper.ensureConnection();

        // 2️⃣ Remove FCM token
        user.set('fcmToken', undefined);
        user.markModified('fcmToken');
        await user.save();

        // 3️⃣ Delete Redis session (user only)
        try {
            const key = `session:user:${userId}`;
            Logger.info(requestId, 'Deleting user session key', { key });

            const deleted = await redis.del(key);
            Logger.info(requestId, 'Redis delete result', { deleted });

        } catch (redisErr) {
            Logger.warn(requestId, 'Redis cleanup failed (non-blocking)', {
                error: redisErr.message
            });
        }

        Logger.success(requestId, 'User logged out successfully', { userId });

        return ResponseHandler.success(res, "Logged out successfully");

    } catch (error) {
        Logger.error(requestId, 'Logout error', {
            error: error.message,
            stack: error.stack,
            userId: req.user?._id
        });

        return ResponseHandler.serverError(res, "Logout failed");
    }
}


}

module.exports = new AuthController();
