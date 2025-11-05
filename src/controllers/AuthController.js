// Authentication Controller
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const OTPUtils = require('../utils/otpUtils');
const OTPService = require('../services/otpService');
const ConnectionHelper = require('../utils/connectionHelper');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');

class AuthController {
    // Generate JWT token
    generateToken(userId) {
        // Validate JWT_SECRET is set
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable is required');
        }

        return jwt.sign(
            { userId },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
    }

    // Send OTP to phone number
    async sendOTP(req, res) {
        const requestId = Logger.generateId('auth-send-otp');
        
        try {
            Logger.info(requestId, '📱 AuthController.sendOTP - Request started');
            Logger.logRequest(requestId, req);
            
            const { phone } = req.body;
            Logger.debug(requestId, `Extracted phone number`, { phone, type: typeof phone });

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

    // Verify OTP and login/register user
    async verifyOTP(req, res) {
        const requestId = Logger.generateId('auth-verify-otp');
        
        try {
            Logger.info(requestId, '🔐 AuthController.verifyOTP - Request started');
            Logger.logRequest(requestId, req);
            
            const { phone, otp } = req.body;
            Logger.debug(requestId, 'Extracted credentials', { phone, otp: '***' });

            // Use service for OTP verification
            Logger.info(requestId, 'Calling OTPService.verifyOTP');
            const verificationResult = await OTPService.verifyOTP(phone, otp);
            Logger.debug(requestId, 'OTPService.verifyOTP result received', { 
                success: verificationResult.success 
            });

            if (!verificationResult.success) {
                Logger.warn(requestId, 'OTP verification failed', { 
                    message: verificationResult.message,
                    phone 
                });
                return ResponseHandler.error(res, verificationResult.message, verificationResult.error, 400, verificationResult.code);
            }
            
            // Clean phone for user lookup
            const cleanPhone = OTPUtils.cleanPhoneNumber(phone);
            Logger.success(requestId, 'OTP verified successfully', { phone: cleanPhone });
            
            // Ensure MongoDB connection is ready
            Logger.debug(requestId, 'Ensuring MongoDB connection');
            await ConnectionHelper.ensureConnection();
            
            // Check if user exists, if not create new user
            Logger.info(requestId, 'Looking up user in database', { phone: cleanPhone });
            let user = await User.findOne({ phone: cleanPhone });
            
            if (!user) {
                // Create new user with incomplete profile
                Logger.info(requestId, 'Creating new user', { phone: cleanPhone });
                user = new User({
                    name: 'New User', // Temporary name
                    phone: cleanPhone,
                    role: 'user', // Default role for new registrations
                    profileCompleted: false, // Mark as incomplete
                    signupAt: new Date()
                });
                const savedUser = await user.save();
                Logger.success(requestId, 'New user created', { userId: savedUser._id });
            } else {
                Logger.info(requestId, 'Existing user found', { 
                    userId: user._id, 
                    name: user.name 
                });
            }

            // Generate JWT token with user ID first to get the exact iat
            Logger.debug(requestId, 'Generating JWT token', { userId: user._id });
            const token = this.generateToken(user._id);
            
            // Extract the iat from the token to set lastLoginAt safely before it
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const tokenIssuedAt = new Date(decoded.iat * 1000); // Convert to milliseconds
            
            Logger.debug(requestId, 'Token generated', { 
                tokenIssuedAt,
                expiresIn: decoded.exp - decoded.iat 
            });
            
            user.lastLoginAt = new Date(tokenIssuedAt.getTime() - 1000); // 1 second before
            await user.save();
          
            Logger.success(requestId, 'User login successful', { 
                userId: user._id,
                profileCompleted: user.profileCompleted 
            });

            // Set JWT token in Authorization header
            res.set('Authorization', `Bearer ${token}`);

            return ResponseHandler.success(res, "Login successful", {
                token: token, // Adding token to response body for testing
                user: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
                    role: user.role,
                    profileCompleted: user.profileCompleted,
                    lastLoginAt: user.lastLoginAt
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

    // Logout user - invalidate current token
    async logout(req, res) {
        const requestId = Logger.generateId('auth-logout');
        
        try {
            const user = req.user;
            
            Logger.info(requestId, 'User logout initiated', { 
                userId: user._id, 
                phone: user.phone 
            });
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Update lastLoginAt to current time (invalidates current token)
            user.lastLoginAt = new Date();
            await user.save();
            
            Logger.success(requestId, 'User logged out successfully', { 
                userId: user._id, 
                phone: user.phone 
            });
            
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
