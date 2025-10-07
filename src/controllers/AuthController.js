// Authentication Controller
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const OTPUtils = require('../utils/otpUtils');
const OTPService = require('../services/otpService');
const ConnectionHelper = require('../utils/connectionHelper');
const ResponseHandler = require('../utils/responseHandler');

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
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`📱 [${requestId}] AuthController.sendOTP START`);
            console.log(`📱 [${requestId}] Request body:`, req.body);
            console.log(`📱 [${requestId}] Request headers:`, req.headers);
            console.log(`📱 [${requestId}] Request IP:`, req.ip || req.connection.remoteAddress);
            
            const { phone } = req.body;
            console.log(`📱 [${requestId}] Extracted phone: ${phone} (type: ${typeof phone})`);

            // Use service for complete OTP workflow
            console.log(`📱 [${requestId}] Calling OTPService.sendOTP...`);
            const result = await OTPService.sendOTP(phone);
            console.log(`📱 [${requestId}] OTPService.sendOTP result:`, result);
            
            if (!result.success) {
                console.log(`📱 [${requestId}] OTP sending failed - Message: ${result.message}`);
                
                if (result.waitTime) {
                    return ResponseHandler.rateLimitError(res, result.waitTime);
                }
                
                return ResponseHandler.error(res, "OTP sending failed", result.message);
            }

            console.log(`📱 [${requestId}] OTP sent successfully to ${phone}`);
            
            // Include OTP in response for testing
            return ResponseHandler.success(res, "OTP sent successfully", { otp: result.otp });

        } catch (error) {
            console.error(`📱 [${requestId}] Send OTP error:`, error);
            console.error(`📱 [${requestId}] Error stack:`, error.stack);
            return ResponseHandler.serverError(res, "Failed to send OTP");
        }
    }

    // Verify OTP and login/register user
    async verifyOTP(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`🔐 [${requestId}] AuthController.verifyOTP START`);
            console.log(`🔐 [${requestId}] Request body:`, req.body);
            console.log(`🔐 [${requestId}] Request headers:`, req.headers);
            console.log(`🔐 [${requestId}] Request IP:`, req.ip || req.connection.remoteAddress);
            
            const { phone, otp } = req.body;
            console.log(`🔐 [${requestId}] Extracted - Phone: ${phone}, OTP: ${otp}`);

            // Use service for OTP verification
            console.log(`🔐 [${requestId}] Calling OTPService.verifyOTP...`);
            const verificationResult = await OTPService.verifyOTP(phone, otp);
            console.log(`🔐 [${requestId}] OTPService.verifyOTP result:`, verificationResult);

            if (!verificationResult.success ) {
                console.log(`🔐 [${requestId}] OTP verification failed: ${verificationResult.message}`);
                return ResponseHandler.error(res, "OTP verification failed", verificationResult.message);
            }
            
            // Clean phone for user lookup
            const cleanPhone = OTPUtils.cleanPhoneNumber(phone);
            console.log(`🔐 [${requestId}] OTP verified successfully for ${cleanPhone}`);
            
            // Ensure MongoDB connection is ready
            console.log(`🔐 [${requestId}] Ensuring MongoDB connection...`);
            await ConnectionHelper.ensureConnection();
            
            // Check if user exists, if not create new user
            console.log(`🔐 [${requestId}] Looking for existing user with phone: ${cleanPhone}`);
            let user = await User.findOne({ phone: cleanPhone });
            
            if (!user) {
                // Create new user with incomplete profile
                console.log(`� [${requestId}] Creating new user for ${cleanPhone}`);
                user = new User({
                    name: 'New User', // Temporary name
                    phone: cleanPhone,
                    role: 'user', // Default role for new registrations
                    profileCompleted: false, // Mark as incomplete
                    signupAt: new Date()
                });
                const savedUser = await user.save();
                console.log(`🔐 [${requestId}] New user created with ID: ${savedUser._id}`);
            } else {
                console.log(`� [${requestId}] User already exists: ${user.name} (ID: ${user._id})`);
            }

            // Generate JWT token with user ID first to get the exact iat
            console.log(`🔐 [${requestId}] Generating JWT token for user: ${user._id}`);
            const token = this.generateToken(user._id);
            
            // Extract the iat from the token to set lastLoginAt safely before it
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const tokenIssuedAt = new Date(decoded.iat * 1000); // Convert to milliseconds
            
            console.log(`🔐 [${requestId}] Token issued at: ${tokenIssuedAt}`);
            console.log(`🔐 [${requestId}] Setting lastLoginAt to: ${new Date(tokenIssuedAt.getTime() - 1000)}`);
            
            user.lastLoginAt = new Date(tokenIssuedAt.getTime() - 1000); // 1 second before
            await user.save();
          
            console.log(`🔐 [${requestId}] JWT token generated: ${token.substring(0, 50)}...`);

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
            console.error('Verify OTP error:', error);
            return ResponseHandler.serverError(res, "Authentication failed");
        }
    }

    // Get current user profile
    async getProfile(req, res) {
        try {
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
            console.error('Get profile error:', error);
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

            console.log(`👤 Profile updated for user: ${user.phone}`);

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
            console.error('Update profile error:', error);
            return ResponseHandler.serverError(res, "Failed to update profile");
        }
    }

    // Logout user - invalidate current token
    async logout(req, res) {
        try {
            const user = req.user;
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Update lastLoginAt to current time (invalidates current token)
            user.lastLoginAt = new Date();
            await user.save();
            
            console.log(`🚪 User logged out: ${user.phone}`);
            
            return ResponseHandler.success(res, "Logged out successfully");
        } catch (error) {
            console.error('Logout error:', error);
            return ResponseHandler.serverError(res, "Logout failed");
        }
    }
}

module.exports = new AuthController();
