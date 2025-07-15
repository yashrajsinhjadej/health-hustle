// Authentication Controller
const User = require('../models/User'); 
const jwt = require('jsonwebtoken');

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
            const otp = 123456; // Simulated OTP, replace with actual OTP generation logic
            console.log(`📱 OTP sent to ${phone}: ${otp}`);


            // Simple success response
            res.json({
                success: true,
                message: 'OTP sent successfully'
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

            if (!phone || !otp) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number and OTP are required'
                });
            }

            // Check if user exists, if not create new user
            let user = await User.findOne({ phone });
            
            if (!user) {
                // Create new user with incomplete profile
                user = new User({
                    name: 'New User', // Temporary name
                    phone: phone,
                    role: 'user', // Default role for new registrations
                    profileCompleted: false // Mark as incomplete
                });
                await user.save();
            }

            // Generate real JWT token with user ID
            const token = this.generateToken(user._id);

            res.json({
                success: true,
                message: 'OTP verified successfully',
                token: token,
                needsProfileCompletion: !user.profileCompleted,
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
            const { name } = req.body;
            const user = req.user;

            // Update user profile
            if (name && name !== 'New User') {
                user.name = name;
                user.profileCompleted = true; // Mark profile as completed
                await user.save();
            }

            res.json({
                success: true,
                message: 'Profile updated successfully',
                user: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
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
