// Authentication Controller
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const OTPUtils = require('../utils/otpUtils');
const OTPService = require('../services/otpService');

class AuthController {
    // Generate JWT token
    generateToken(userId) {
        return jwt.sign(
            { userId },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );
    }

    // Send OTP to phone number
    async sendOTP(req, res) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number is required'
                });
            }

            // Use service for complete OTP workflow
            const result = await OTPService.sendOTP(phone);
            if (!result.success) {
                const statusCode = result.waitTime ? 429 : 400;
                return res.status(statusCode).json({
                    success: false,
                    error: result.message,
                    waitTime: result.waitTime
                });
            }

            res.json({
                success: true,
                message: result.message,
                expiresIn: result.expiresIn,
                otp: result.otp // Only for testing; remove in production!
            });

        } catch (error) {
            console.error('Send OTP error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    // Verify OTP and login/register user
    async verifyOTP(req, res) {
        try {
            const { phone, otp } = req.body;
            console.log(phone, otp);
            if (!phone || !otp) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number and OTP are required'
                });
            }

            // Use service for OTP verification
            const verificationResult = await OTPService.verifyOTP(phone, otp);

            if (!verificationResult.success ) {
                return res.status(400).json({
                    success: false,
                    error: verificationResult.message
                });
            }
            
            // Clean phone for user lookup
            const cleanPhone = OTPUtils.cleanPhoneNumber(phone);
            console.log(`🔐 OTP verified successfully for ${cleanPhone}`);
            
            // Check if user exists, if not create new user
            let user = await User.findOne({ phone: cleanPhone });
            
            if (!user) {
                // Create new user with incomplete profile
                console.log(`👤 Creating new user for ${cleanPhone}`);
                user = new User({
                    name: 'New User', // Temporary name
                    phone: cleanPhone,
                    role: 'user', // Default role for new registrations
                    profileCompleted: false // Mark as incomplete
                });
                await user.save();
            } else {
                console.log(`👤 User already exists: ${user.name}`);
            }

            // Generate JWT token with user ID
            const token = this.generateToken(user._id);
            console.log(token);

            // Set JWT token in Authorization header
            res.set('Authorization', `Bearer ${token}`);

            res.json({
                success: true,
                message: 'OTP verified successfully',
                user: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
                    role: user.role,
                    profileCompleted: user.profileCompleted
                }
            });

        } catch (error) {
            console.error('Verify OTP error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    // Get current user profile
    async getProfile(req, res) {
        try {
            // req.user is populated by the authenticateToken middleware
            res.json({
                success: true,
                message: 'Profile fetched successfully',
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
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    // Update user profile
    async updateProfile(req, res) {
        try {
            const user = req.user;
            const updateData = {};
            let hasUpdates = false;

            // Extract and validate fields from request body
            const { name, email, dateOfBirth, gender, height, weight, fitnessGoal, activityLevel } = req.body;

            // Update name if provided
            if (name && name.trim() !== '' && name !== 'New User') {
                updateData.name = name.trim();
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

            // Update activity level if provided
            if (activityLevel && ['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(activityLevel.toLowerCase())) {
                updateData.activityLevel = activityLevel.toLowerCase();
                hasUpdates = true;
            }

            // Check if any updates were provided
            if (!hasUpdates) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid fields provided for update'
                });
            }

            // Mark profile as completed if name is being updated
            if (updateData.name) {
                updateData.profileCompleted = true;
            }

            // Update user in database
            Object.assign(user, updateData);
            await user.save();

            console.log(`👤 Profile updated for user: ${user.phone}`);

            res.json({
                success: true,
                message: 'Profile updated successfully',
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
                    activityLevel: user.activityLevel,
                    role: user.role,
                    profileCompleted: user.profileCompleted
                }
            });

        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = new AuthController();
