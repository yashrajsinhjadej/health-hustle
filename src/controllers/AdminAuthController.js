// Admin Authentication Controller
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const EmailService = require('../services/emailService');
const ResponseHandler = require('../utils/ResponseHandler');

const ConnectionHelper = require('../utils/connectionHelper');

class AdminAuthController {
    // Generate JWT token
    generateToken(userId) {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable is required');
        }

        return jwt.sign(
            { userId },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
    }

    // Admin Signup
    async signup(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`� [ADMIN API CALLED] ================================`);
            console.log(`🚀 [ADMIN API] Method: SIGNUP`);
            console.log(`🚀 [ADMIN API] URL: ${req.originalUrl}`);
            console.log(`🚀 [ADMIN API] User-Agent: ${req.get('User-Agent')}`);
            console.log(`🚀 [ADMIN API] IP: ${req.ip || req.connection.remoteAddress}`);
            console.log(`🚀 [ADMIN API] Deployment: ${process.env.VERCEL_URL || 'LOCAL'}`);
            console.log(`🚀 [ADMIN API] Request ID: ${requestId}`);
            console.log(`🚀 [ADMIN API] ================================`);
            console.log(`�🔐 [${requestId}] AdminAuthController.signup START`);
            console.log(`🔐 [${requestId}] Request body:`, req.body);
            
            const { name, email, password } = req.body;
            
            // Basic validation
            if (!name || !email || !password) {
                return ResponseHandler.error(res, "Validation failed", "Name, email, and password are required");
            }

            // Validate name format
            const trimmedName = name.trim();
            const nameRegex = /^[a-zA-Z\s\-\.\']+$/; // Allow letters, spaces, hyphens, dots, apostrophes
            const hasLetter = /[a-zA-Z]/.test(trimmedName); // Must contain at least one letter
            
            if (!nameRegex.test(trimmedName)) {
                return ResponseHandler.error(res, "Validation failed", "Name can only contain letters, spaces, hyphens, dots, and apostrophes", 400);
            }
            
            if (!hasLetter) {
                return ResponseHandler.error(res, "Validation failed", "Name must contain at least one letter", 400);
            }
            
            if (trimmedName.length < 2) {
                return ResponseHandler.error(res, "Validation failed", "Name must be at least 2 characters long", 400);
            }
            
            if (trimmedName.length > 50) {
                return ResponseHandler.error(res, "Validation failed", "Name must be less than 50 characters", 400);
            }

            if (password.length < 6) {
                return ResponseHandler.error(res, "Validation failed", "Password must be at least 6 characters long");
            }

            // Ensure MongoDB connection is ready
            console.log(`🔐 [${requestId}] Ensuring MongoDB connection...`);
            await ConnectionHelper.ensureConnection();

            // Check if admin with this email already exists
            console.log(`🔐 [${requestId}] Checking for existing admin with email: ${email}`);
            const existingAdmin = await User.findOne({ email: email.toLowerCase(), role: 'admin' });
            
            if (existingAdmin) {
                console.log(`🔐 [${requestId}] Admin with email ${email} already exists`);
                return ResponseHandler.error(res, "Registration failed", "Admin with this email already exists");
            }

            // Hash password
            console.log(`🔐 [${requestId}] Hashing password...`);
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create new admin user
            console.log(`🔐 [${requestId}] Creating new admin user...`);
            const newAdmin = new User({
                name: name.trim(),
                email: email.toLowerCase().trim(),
                password: hashedPassword,
                role: 'admin',
                profileCompleted: false, // Keep false for admin users - they don't need user profile fields
                signupAt: new Date()
            });

            const savedAdmin = await newAdmin.save();
            console.log(`🔐 [${requestId}] New admin created with ID: ${savedAdmin._id}`);

            // Generate JWT token
            console.log(`🔐 [${requestId}] Generating JWT token...`);
            const adminController = new AdminAuthController();
            const token = adminController.generateToken(savedAdmin._id);

            return ResponseHandler.success(res, "Admin registration successful", {
                token: token,
                admin: {
                    id: savedAdmin._id,
                    name: savedAdmin.name,
                    email: savedAdmin.email,
                    role: savedAdmin.role,
                    signupAt: savedAdmin.signupAt
                }
            });

        } catch (error) {
            console.error(`🔐 [${requestId}] Admin signup error:`, error);
            return ResponseHandler.serverError(res, "Registration failed");
        }
    }

    // Admin Login
    async login(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`� [ADMIN API CALLED] ================================`);
            console.log(`🚀 [ADMIN API] Method: LOGIN`);
            console.log(`🚀 [ADMIN API] URL: ${req.originalUrl}`);
            console.log(`🚀 [ADMIN API] User-Agent: ${req.get('User-Agent')}`);
            console.log(`🚀 [ADMIN API] IP: ${req.ip || req.connection.remoteAddress}`);
            console.log(`🚀 [ADMIN API] Deployment: ${process.env.VERCEL_URL || 'LOCAL'}`);
            console.log(`🚀 [ADMIN API] Request ID: ${requestId}`);
            console.log(`🚀 [ADMIN API] ================================`);
            console.log(`�🔐 [${requestId}] AdminAuthController.login START`);
            console.log(`🔐 [${requestId}] Request body:`, { 
                email: req.body.email, 
                password: '***HIDDEN***' 
            });
            
            const { email, password } = req.body;
            
            // Basic validation
            if (!email || !password) {
                console.log(`🔐 [${requestId}] Missing required fields`);
                return ResponseHandler.error(res, "Validation failed", "Email and password are required", 400);
            }

            // Ensure MongoDB connection is ready
            console.log(`🔐 [${requestId}] Ensuring MongoDB connection...`);
            try {
                await ConnectionHelper.ensureConnection();
            } catch (connectionError) {
                console.error(`🔐 [${requestId}] Database connection failed:`, connectionError);
                return ResponseHandler.error(res, "Server error", "Database connection failed. Please try again later.", 503);
            }

            // Find admin user
            console.log(`🔐 [${requestId}] Looking for admin with email: ${email}`);
            let admin;
            try {
                admin = await User.findOne({ 
                    email: email.toLowerCase(), 
                    role: 'admin' 
                });
            } catch (dbError) {
                console.error(`🔐 [${requestId}] Database query failed:`, dbError);
                return ResponseHandler.error(res, "Server error", "Database query failed. Please try again later.", 500);
            }

            if (!admin) {
                console.log(`🔐 [${requestId}] Admin not found with email: ${email}`);
                return ResponseHandler.error(res, "Login failed", "Invalid email or password", 401);
            }

            // Verify password
            console.log(`🔐 [${requestId}] Verifying password...`);
            let isPasswordValid;
            try {
                isPasswordValid = await bcrypt.compare(password, admin.password);
            } catch (bcryptError) {
                console.error(`🔐 [${requestId}] Password verification failed:`, bcryptError);
                return ResponseHandler.error(res, "Server error", "Password verification failed. Please try again later.", 500);
            }

            if (!isPasswordValid) {
                console.log(`🔐 [${requestId}] Invalid password for admin: ${email}`);
                return ResponseHandler.error(res, "Login failed", "Invalid email or password", 401);
            }

            // Generate JWT token with admin ID first to get the exact iat
            console.log(`🔐 [${requestId}] Generating JWT token for admin: ${admin._id}`);
            let token;
            try {
                const adminController = new AdminAuthController();
                token = adminController.generateToken(admin._id);
            } catch (jwtError) {
                console.error(`🔐 [${requestId}] JWT generation failed:`, jwtError);
                return ResponseHandler.error(res, "Server error", "Token generation failed. Please check server configuration.", 500);
            }
            
            // Extract the iat from the token to set lastLoginAt safely before it
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (jwtVerifyError) {
                console.error(`🔐 [${requestId}] JWT verification failed:`, jwtVerifyError);
                return ResponseHandler.error(res, "Server error", "Token verification failed. Please try again later.", 500);
            }
            
            const tokenIssuedAt = new Date(decoded.iat * 1000); // Convert to milliseconds
            
            console.log(`🔐 [${requestId}] Token issued at: ${tokenIssuedAt}`);
            console.log(`🔐 [${requestId}] Setting lastLoginAt to: ${new Date(tokenIssuedAt.getTime() - 1000)}`);
            
            admin.lastLoginAt = new Date(tokenIssuedAt.getTime() - 1000); // 1 second before
            
            // Save admin with updated lastLoginAt
            try {
                await admin.save();
            } catch (saveError) {
                console.error(`🔐 [${requestId}] Failed to save admin lastLoginAt:`, saveError);
                // Don't fail the login for this - just log the error
                console.log(`🔐 [${requestId}] Login will proceed despite save failure`);
            }

            console.log(`🔐 [${requestId}] Admin login successful for: ${email}`);

            return ResponseHandler.success(res, "Login successful", {
                token: token,
                admin: {
                    id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    role: admin.role,
                    lastLoginAt: admin.lastLoginAt
                }
            });

        } catch (error) {
            console.error(`🔐 [${requestId}] Admin login error:`, error);
            
            // Handle specific error types
            if (error.name === 'ValidationError') {
                return ResponseHandler.error(res, "Validation failed", "Invalid input data provided", 400);
            }
            
            if (error.name === 'MongoNetworkError' || error.name === 'MongoServerError') {
                return ResponseHandler.error(res, "Server error", "Database connection issue. Please try again later.", 503);
            }
            
            if (error.name === 'JsonWebTokenError') {
                return ResponseHandler.error(res, "Server error", "Authentication token error. Please try again later.", 500);
            }
            
            // Generic server error for unhandled cases
            return ResponseHandler.error(res, "Server error", "Login failed. Please try again later.", 500);
        }
    }

    // Get admin profile - Enhanced with request tracking and comprehensive error handling
    async getProfile(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`👤 [${requestId}] AdminAuthController.getProfile START`);
            console.log(`👤 [${requestId}] Admin profile request from IP: ${req.ip || req.connection.remoteAddress}`);
            
            const admin = req.user;
            console.log(`👤 [${requestId}] Fetching profile for admin: ${admin.email} (ID: ${admin._id})`);
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Validate admin exists and has proper role
            if (!admin || admin.role !== 'admin') {
                console.log(`👤 [${requestId}] Invalid admin access attempt - User: ${admin ? admin.email : 'null'}, Role: ${admin ? admin.role : 'null'}`);
                return ResponseHandler.error(res, "Access denied", "Invalid admin credentials", 403);
            }
            
            const profileData = {
                admin: {
                    id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    role: admin.role,
                    createdAt: admin.createdAt,
                    lastLoginAt: admin.lastLoginAt,
                    profileCompleted: admin.profileCompleted
                }
            };
            
            console.log(`👤 [${requestId}] Admin profile fetched successfully for: ${admin.email}`);
            
            return ResponseHandler.success(res, "Admin profile fetched successfully", profileData);
            
        } catch (error) {
            console.error(`👤 [${requestId}] Get admin profile error:`, error);
            
            // Handle specific error types
            if (error.name === 'CastError') {
                return ResponseHandler.error(res, "Invalid request", "Invalid admin ID format", 400);
            }
            
            return ResponseHandler.serverError(res, "Failed to fetch admin profile");
        }
    }

    // Request password reset for admin (POST /admin/forgot-password)
    async forgotPassword(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`� [ADMIN API CALLED] ================================`);
            console.log(`🚀 [ADMIN API] Method: FORGOT PASSWORD`);
            console.log(`🚀 [ADMIN API] URL: ${req.originalUrl}`);
            console.log(`🚀 [ADMIN API] User-Agent: ${req.get('User-Agent')}`);
            console.log(`🚀 [ADMIN API] IP: ${req.ip || req.connection.remoteAddress}`);
            console.log(`🚀 [ADMIN API] Deployment: ${process.env.VERCEL_URL || 'LOCAL'}`);
            console.log(`🚀 [ADMIN API] Request ID: ${requestId}`);
            console.log(`🚀 [ADMIN API] FRONTEND_URL: ${process.env.FRONTEND_URL}`);
            console.log(`🚀 [ADMIN API] ================================`);
            console.log(`�🔑 [${requestId}] AdminAuthController.forgotPassword START`);
            console.log(`🔑 [${requestId}] Request body:`, req.body);

            const { email } = req.body;

            // Validate email
            if (!email) {
                console.log(`🔑 [${requestId}] Email is required`);
                return ResponseHandler.badRequest(res, "Email is required");
            }

            // Ensure MongoDB connection
            await ConnectionHelper.ensureConnection();

            // Only allow admin users to reset password
            const admin = await User.findOne({ 
                email: email.toLowerCase().trim(),
                role: 'admin' // Only check for admin users
            });
            
            // For security reasons, we'll always return success even if admin doesn't exist
            // This prevents email enumeration attacks
            if (!admin) {
                console.log(`🔑 [${requestId}] Admin not found for email: ${email}`);
                // Still return success to prevent email enumeration
                return ResponseHandler.success(res, "If an admin account with this email exists, we'll send you a password reset link. The link will expire in 24 hours. Please also check your spam folder if you don't see the email.");
            }

            // Generate unique token
            const resetToken = uuidv4();
            console.log(`🔑 [${requestId}] Generated reset token: ${resetToken.substring(0, 8)}...`);

            // Set token to expire in 24 hours
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            // Delete any existing password reset tokens for this admin
            await PasswordReset.deleteMany({ userId: admin._id });
            console.log(`🔑 [${requestId}] Deleted existing reset tokens for admin: ${admin._id}`);

            // Save new token in PasswordReset collection
            const passwordReset = new PasswordReset({
                userId: admin._id,
                token: resetToken,
                expiresAt: expiresAt
            });

            await passwordReset.save();
            console.log(`🔑 [${requestId}] Password reset token saved with expiry: ${expiresAt}`);

            // Generate reset link for frontend (environment-based URL)
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
            const resetLink = `${frontendUrl}/admin/reset-password?token=${resetToken}`;
            console.log(`🔑 [${requestId}] Generated reset link: ${resetLink}`);

            // Initialize email service
            const emailService = new EmailService();

            // Test email connection before sending
            try {
                const isEmailConfigured = await emailService.testConnection();
                if (!isEmailConfigured) {
                    console.log(`🔑 [${requestId}] Email service not configured properly`);
                    return ResponseHandler.serverError(res, "Email service is not configured. Please contact the system administrator.");
                }
            } catch (testError) {
                console.error(`🔑 [${requestId}] Email connection test failed:`, testError);
                return ResponseHandler.serverError(res, "Email service connection failed. Please contact the system administrator.");
            }

            // Send admin password reset email with actual link
            try {
                const emailResult = await emailService.sendAdminPasswordResetEmail(
                    admin.email,
                    admin.name || 'Admin',
                    resetLink
                );
                console.log(`🔑 [${requestId}] Admin password reset email sent successfully:`, emailResult.messageId);
            } catch (emailError) {
                console.error(`🔑 [${requestId}] Email sending failed:`, emailError);
                // Delete the token if email fails
                await PasswordReset.deleteOne({ token: resetToken });
                // Still return success to prevent email enumeration, but log the error
                console.log(`🔑 [${requestId}] Token deleted due to email failure, returning success response for security`);
            }

            return ResponseHandler.success(res, "If an admin account with this email exists, we'll send you a password reset link. The link will expire in 24 hours. Please also check your spam folder if you don't see the email.");

        } catch (error) {
            console.error(`🔑 [${requestId}] Admin forgot password error:`, error);
            return ResponseHandler.serverError(res, "Failed to process password reset request. Please try again later.");
        }
    }

    // Reset password with token (POST /admin/reset-password)
    async resetPassword(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`� [ADMIN API CALLED] ================================`);
            console.log(`🚀 [ADMIN API] Method: RESET PASSWORD`);
            console.log(`🚀 [ADMIN API] URL: ${req.originalUrl}`);
            console.log(`🚀 [ADMIN API] User-Agent: ${req.get('User-Agent')}`);
            console.log(`🚀 [ADMIN API] IP: ${req.ip || req.connection.remoteAddress}`);
            console.log(`🚀 [ADMIN API] Deployment: ${process.env.VERCEL_URL || 'LOCAL'}`);
            console.log(`🚀 [ADMIN API] Request ID: ${requestId}`);
            console.log(`🚀 [ADMIN API] ================================`);
            console.log(`�🔑 [${requestId}] AdminAuthController.resetPassword START`);
            console.log(`🔑 [${requestId}] Request body:`, { token: req.body.token ? 'PROVIDED' : 'MISSING', password: req.body.password ? 'PROVIDED' : 'MISSING' });

            const { token, password } = req.body;

            // Validate input
            if (!token || !password) {
                console.log(`🔑 [${requestId}] Missing required fields`);
                return ResponseHandler.error(res, "Validation failed", "Token and password are required", 400);
            }

            if (password.length < 6) {
                console.log(`🔑 [${requestId}] Password too short`);
                return ResponseHandler.error(res, "Validation failed", "Password must be at least 6 characters long", 400);
            }

            // Ensure MongoDB connection
            await ConnectionHelper.ensureConnection();

            // Find the password reset record
            const passwordReset = await PasswordReset.findOne({ 
                token: token,
                used: false,
                expiresAt: { $gt: new Date() } // Token must not be expired
            }).populate('userId');

            if (!passwordReset) {
                console.log(`🔑 [${requestId}] Invalid or expired token: ${token.substring(0, 8)}...`);
                return ResponseHandler.error(res, "Invalid token", "Invalid or expired reset token", 400);
            }

            const admin = passwordReset.userId;

            // Verify it's an admin user
            if (!admin || admin.role !== 'admin') {
                console.log(`🔑 [${requestId}] Token not associated with admin user`);
                return ResponseHandler.error(res, "Invalid token", "Invalid reset token", 400);
            }

            // Hash new password
            console.log(`🔑 [${requestId}] Hashing new password for admin: ${admin._id}`);
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Update admin password
            admin.password = hashedPassword;
            // Only invalidate sessions for security (this is actually good practice)
            // The user will need to login again after password reset
            admin.lastLoginAt = new Date(); // Invalidate existing sessions for security
            await admin.save();

            // Mark token as used and delete it
            await PasswordReset.deleteOne({ _id: passwordReset._id });
            console.log(`🔑 [${requestId}] Password reset completed for admin: ${admin.email}`);

            return ResponseHandler.success(res, "Password has been reset successfully. You can now login with your new password.");

        } catch (error) {
            console.error(`🔑 [${requestId}] Admin reset password error:`, error);
            return ResponseHandler.serverError(res, "Failed to reset password. Please try again later.");
        }
    }

    // Display password reset form (GET /admin/reset-password)
    async showResetForm(req, res) {
        try {
            const { token } = req.query;

            if (!token) {
                return res.status(400).send(`
                    <html>
                        <head><title>Invalid Reset Link</title></head>
                        <body>
                            <h1>Invalid Reset Link</h1>
                            <p>The password reset link is invalid or missing the token.</p>
                        </body>
                    </html>
                `);
            }

            // Verify token exists and is not expired
            const passwordReset = await PasswordReset.findOne({ 
                token: token,
                used: false,
                expiresAt: { $gt: new Date() }
            });

            if (!passwordReset) {
                return res.status(400).send(`
                    <html>
                        <head><title>Expired Reset Link</title></head>
                        <body>
                            <h1>Reset Link Expired</h1>
                            <p>This password reset link has expired or has already been used.</p>
                            <p><a href="/admin/forgot-password">Request a new password reset link</a></p>
                        </body>
                    </html>
                `);
            }

            // Display password reset form
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Reset Admin Password - Health Hustle</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
                        .form-group { margin-bottom: 15px; }
                        label { display: block; margin-bottom: 5px; font-weight: bold; }
                        input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
                        button { background-color: #e74c3c; color: white; padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
                        button:hover { background-color: #c0392b; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .header h1 { color: #e74c3c; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Health Hustle Admin</h1>
                        <h2>Reset Your Password</h2>
                    </div>
                    
                    <form method="POST" action="/api/admin/reset-password">
                        <input type="hidden" name="token" value="${token}">
                        
                        <div class="form-group">
                            <label for="password">New Password:</label>
                            <input type="password" id="password" name="password" required minlength="6" 
                                   placeholder="Enter your new password (min 6 characters)">
                        </div>
                        
                        <div class="form-group">
                            <label for="confirmPassword">Confirm Password:</label>
                            <input type="password" id="confirmPassword" name="confirmPassword" required minlength="6" 
                                   placeholder="Confirm your new password">
                        </div>
                        
                        <button type="submit">Reset Password</button>
                    </form>

                    <script>
                        document.querySelector('form').addEventListener('submit', function(e) {
                            const password = document.getElementById('password').value;
                            const confirmPassword = document.getElementById('confirmPassword').value;
                            
                            if (password !== confirmPassword) {
                                e.preventDefault();
                                alert('Passwords do not match');
                                return false;
                            }
                            
                            if (password.length < 6) {
                                e.preventDefault();
                                alert('Password must be at least 6 characters long');
                                return false;
                            }
                        });
                    </script>
                </body>
                </html>
            `);

        } catch (error) {
            console.error('Show reset form error:', error);
            return res.status(500).send(`
                <html>
                    <head><title>Error</title></head>
                    <body>
                        <h1>Server Error</h1>
                        <p>An error occurred while loading the reset form. Please try again later.</p>
                    </body>
                </html>
            `);
        }
    }

    // Delete User and return updated list with pagination
    async deleteUser(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`🗑️  [${requestId}] AdminAuthController.deleteUser START`);
            console.log(`🗑️  [${requestId}] Request params:`, req.params);
            console.log(`🗑️  [${requestId}] Request body:`, req.body);
            
            // Ensure database connection
            console.log(`🗑️  [${requestId}] Ensuring MongoDB connection...`);
            await ConnectionHelper.ensureConnection();

            const { userId } = req.params;
            const { 
                page = 1, 
                limit = 10, 
                search = '', 
                status = '' 
            } = req.body;

            console.log(`🗑️  [${requestId}] Deleting user with ID: ${userId}`);
            
            // 1. Check if user exists and is not an admin
            const userToDelete = await User.findById(userId);
            if (!userToDelete) {
                console.log(`🗑️  [${requestId}] User not found: ${userId}`);
                return ResponseHandler.error(res, "User not found", "The specified user does not exist", 404);
            }

            if (userToDelete.role === 'admin') {
                console.log(`🗑️  [${requestId}] Attempted to delete admin user: ${userId}`);
                return ResponseHandler.error(res, "Cannot delete admin", "Admin users cannot be deleted", 403);
            }

            // 2. Delete the user from database
            await User.findByIdAndDelete(userId);
            console.log(`🗑️  [${requestId}] User deleted successfully: ${userId}`);

            // 3. Fetch all users (exclude admins from the list)
            let users = await User.find({ role: { $ne: 'admin' } })
                .select('name email phone gender age profileCompleted status signupAt lastLoginAt')
                .lean();

            console.log(`🗑️  [${requestId}] Total users found: ${users.length}`);

            // 4. Apply search filtering
            if (search && search.trim()) {
                const searchLower = search.toLowerCase().trim();
                users = users.filter(user => 
                    user.name?.toLowerCase().includes(searchLower) ||
                    user.email?.toLowerCase().includes(searchLower) ||
                    user.phone?.includes(search.trim())
                );
                console.log(`🗑️  [${requestId}] Users after search filter: ${users.length}`);
            }

            // 5. Apply status filtering
            if (status && status.trim()) {
                users = users.filter(user => user.status === status);
                console.log(`🗑️  [${requestId}] Users after status filter: ${users.length}`);
            }

            // 6. Calculate pagination
            const totalUsers = users.length;
            const totalPages = Math.ceil(totalUsers / limit);
            const currentPage = Math.max(1, Math.min(page, totalPages));
            const startIndex = (currentPage - 1) * limit;
            const endIndex = startIndex + parseInt(limit);
            
            // 7. Get paginated users
            const paginatedUsers = users.slice(startIndex, endIndex);

            // 8. Format users for response
            const formattedUsers = paginatedUsers.map(user => ({
                id: user._id.toString(),
                name: user.name || 'N/A',
                email: user.email || 'N/A',
                phone: user.phone || 'N/A',
                gender: user.gender || 'N/A',
                age: user.age || 0,
                profileCompleted: user.profileCompleted || false,
                status: user.status || 'Inactive',
                signupDate: user.signupAt?.toISOString() || new Date().toISOString(),
                lastLogin: user.lastLoginAt?.toISOString() || null
            }));

            // 9. Calculate stats for all filtered users
            const stats = {
                totalUsers: totalUsers,
                activeUsers: users.filter(u => u.status === 'Active').length,
                completedProfiles: users.filter(u => u.profileCompleted === true).length
            };

            // 10. Build response
            const responseData = {
                users: formattedUsers,
                pagination: {
                    currentPage: currentPage,
                    totalPages: totalPages || 1,
                    totalUsers: totalUsers,
                    hasNextPage: currentPage < totalPages,
                    hasPrevPage: currentPage > 1
                },
                stats: stats
            };

            console.log(`🗑️  [${requestId}] Response pagination:`, responseData.pagination);
            console.log(`🗑️  [${requestId}] Response stats:`, responseData.stats);
            console.log(`🗑️  [${requestId}] AdminAuthController.deleteUser SUCCESS`);
            
            return ResponseHandler.success(res, "User deleted successfully", responseData);

        } catch (error) {
            console.error(`🗑️  [${requestId}] Admin delete user error:`, error);
            
            // Handle specific error types
            if (error.name === 'CastError') {
                return ResponseHandler.error(res, "Invalid request", "Invalid user ID format", 400);
            }
            
            return ResponseHandler.error(res, "Server error", "Failed to delete user. Please try again later.", 500);
        }
    }

    // Admin Dashboard with Pagination and Performance Optimization
    async dashboard(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`� [ADMIN API CALLED] ================================`);
            console.log(`🚀 [ADMIN API] Method: DASHBOARD`);
            console.log(`🚀 [ADMIN API] URL: ${req.originalUrl}`);
            console.log(`🚀 [ADMIN API] User-Agent: ${req.get('User-Agent')}`);
            console.log(`🚀 [ADMIN API] IP: ${req.ip || req.connection.remoteAddress}`);
            console.log(`🚀 [ADMIN API] Deployment: ${process.env.VERCEL_URL || 'LOCAL'}`);
            console.log(`🚀 [ADMIN API] Request ID: ${requestId}`);
            console.log(`🚀 [ADMIN API] ================================`);
            console.log(`�📊 [${requestId}] AdminAuthController.dashboard START`);
            console.log(`📊 [${requestId}] Query params:`, req.query);

            // Extract pagination parameters
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 users per page
            const search = req.query.search || '';
            const status = req.query.status; // 'active', 'inactive', or undefined for all

            console.log(`📊 [${requestId}] Pagination: page=${page}, limit=${limit}, search="${search}", status=${status}`);

            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();

            // Build search and filter query for users
            let userQuery = { role: 'user' };
            
            if (search) {
                userQuery.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } }
                ];
            }

            if (status === 'active') {
                userQuery.isActive = true;
            } else if (status === 'inactive') {
                userQuery.isActive = false;
            }

            console.log(`📊 [${requestId}] User query:`, JSON.stringify(userQuery));

            // Use MongoDB aggregation for efficient stats calculation (all users with role 'user')
            const statsAggregation = [
                { $match: { role: 'user' } },
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        activeUsers: {
                            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
                        },
                        inactiveUsers: {
                            $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] }
                        },
                        completedProfiles: {
                            $sum: { $cond: [{ $eq: ['$profileCompleted', true] }, 1, 0] }
                        },
                        verifiedUsers: {
                            $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] }
                        }
                    }
                }
            ];

            console.log(`📊 [${requestId}] Executing stats aggregation...`);
            const statsResult = await User.aggregate(statsAggregation);
            const stats = statsResult[0] || {
                totalUsers: 0,
                activeUsers: 0,
                inactiveUsers: 0,
                completedProfiles: 0,
                verifiedUsers: 0
            };

            console.log(`📊 [${requestId}] Stats calculated:`, stats);

            // Get paginated user list based on query
            const skip = (page - 1) * limit;
            const totalFilteredUsers = await User.countDocuments(userQuery);
            const totalPages = Math.ceil(totalFilteredUsers / limit);

            console.log(`📊 [${requestId}] Pagination calc: skip=${skip}, totalFiltered=${totalFilteredUsers}, totalPages=${totalPages}`);

            const users = await User.find(userQuery)
                .select('name email gender age phone profileCompleted isActive isVerified signupAt lastLoginAt')
                .sort({ signupAt: -1 }) // Newest first
                .skip(skip)
                .limit(limit)
                .lean(); // Use lean() for better performance

            console.log(`📊 [${requestId}] Found ${users.length} users`);

            // Format users data for frontend
            const formattedUsers = users.map(user => ({
                id: user._id,
                name: user.name || 'New User',
                email: user.email || 'Not provided',
                phone: user.phone || 'Not provided',
                gender: user.gender || 'Not specified',
                age: user.age || 'Not specified',
                profileCompleted: user.profileCompleted || false,
                isVerified: user.isVerified || false,
                status: user.isActive ? 'Active' : 'Inactive',
                signupDate: user.signupAt,
                lastLogin: user.lastLoginAt || 'Never'
            }));

            const responseData = {
                stats: {
                    totalUsers: stats.totalUsers,
                    activeUsers: stats.activeUsers,
                    inactiveUsers: stats.inactiveUsers,
                    completedProfiles: stats.completedProfiles,
                    verifiedUsers: stats.verifiedUsers || 0
                },
                users: formattedUsers,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalUsers: totalFilteredUsers,
                    usersPerPage: limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                },
                admin: {
                    id: req.user._id,
                    name: req.user.name,
                    email: req.user.email,
                    role: req.user.role
                },
                filters: {
                    search: search,
                    status: status
                }
            };

            console.log(`📊 [${requestId}] Dashboard response prepared - ${formattedUsers.length} users on page ${page}`);
            console.log(`📊 [${requestId}] AdminAuthController.dashboard SUCCESS`);
            
            return ResponseHandler.success(res, "Dashboard data retrieved successfully", responseData);

        } catch (error) {
            console.error(`📊 [${requestId}] Admin dashboard error:`, error);
            
            if (error.name === 'CastError') {
                return ResponseHandler.error(res, "Invalid request", "Invalid page or limit parameter", 400);
            }
            
            return ResponseHandler.error(res, "Server error", "Failed to load dashboard data. Please try again later.", 500);
        }
    }

    // Admin Logout - Enhanced with admin-specific tracking and security monitoring
    async logout(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`🚪 [${requestId}] AdminAuthController.logout START`);
            console.log(`🚪 [${requestId}] Admin logout initiated from IP: ${req.ip || req.connection.remoteAddress}`);
            console.log(`🚪 [${requestId}] User-Agent: ${req.headers['user-agent']}`);
            
            const admin = req.user;
            console.log(`🚪 [${requestId}] Admin details: ID=${admin._id}, Email=${admin.email}, Role=${admin.role}`);
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Record logout timestamp for session invalidation
            const logoutTime = new Date();
            admin.lastLoginAt = logoutTime;
            await admin.save();
            
            console.log(`🚪 [${requestId}] Admin session invalidated successfully`);
            console.log(`🚪 [${requestId}] Admin logged out: ${admin.email} (ID: ${admin._id}) at ${logoutTime.toISOString()}`);
            
            // Log admin logout for security monitoring
            console.log(`🛡️ [${requestId}] ADMIN LOGOUT EVENT - Email: ${admin.email}, IP: ${req.ip || req.connection.remoteAddress}, Timestamp: ${logoutTime.toISOString()}`);
            
            return ResponseHandler.success(res, "Admin logged out successfully", {
                logoutTime: logoutTime.toISOString(),
                sessionInvalidated: true
            });
            
        } catch (error) {
            console.error(`🚪 [${requestId}] Admin logout error:`, error);
            return ResponseHandler.serverError(res, "Admin logout failed");
        }
    }

    // Get Individual User Details - Enhanced with comprehensive validation and security
    async getUser(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`👤 [${requestId}] AdminAuthController.getUser START`);
            console.log(`👤 [${requestId}] Admin requesting: ${req.user.email} (ID: ${req.user._id})`);
            console.log(`👤 [${requestId}] Target user ID: ${req.params.userId}`);
            console.log(`👤 [${requestId}] Request from IP: ${req.ip || req.connection.remoteAddress}`);

            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();

            const { userId } = req.params;

            // Validate userId format
            if (!userId || userId.length !== 24) {
                console.log(`👤 [${requestId}] Invalid user ID format: ${userId}`);
                return ResponseHandler.error(res, "Invalid user ID", "User ID must be a valid 24-character MongoDB ObjectId", 400);
            }

            // Find user by ID (exclude admin users from regular user lookup)
            console.log(`👤 [${requestId}] Looking for user in database...`);
            const user = await User.findOne({ 
                _id: userId, 
                role: { $ne: 'admin' } // Exclude admin users for security
            }).lean();

            if (!user) {
                console.log(`👤 [${requestId}] User not found: ${userId}`);
                return ResponseHandler.error(res, "User not found", "The specified user does not exist", 404);
            }

            console.log(`👤 [${requestId}] Found user: ${user.name} (${user.email || user.phone})`);

            // Format user data (exclude sensitive fields)
            const userData = {
                id: user._id,
                name: user.name || 'New User',
                email: user.email || 'Not provided',
                phone: user.phone || 'Not provided',
                gender: user.gender || 'Not specified',
                age: user.age || 'Not specified',
                profileCompleted: user.profileCompleted || false,
                isVerified: user.isVerified || false,
                status: user.isActive ? 'Active' : 'Inactive',
                signupDate: user.signupAt || user.createdAt,
                lastLogin: user.lastLoginAt || 'Never',
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            };

            console.log(`👤 [${requestId}] User details retrieved successfully for: ${user.name}`);
            console.log(`👤 [${requestId}] AdminAuthController.getUser SUCCESS`);

            return ResponseHandler.success(res, "User details retrieved successfully", {
                user: userData,
                requestedBy: {
                    adminId: req.user._id,
                    adminEmail: req.user.email,
                    requestTime: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error(`👤 [${requestId}] Get user error:`, error);
            
            if (error.name === 'CastError') {
                return ResponseHandler.error(res, "Invalid request", "Invalid user ID format", 400);
            }
            
            return ResponseHandler.serverError(res, "Failed to retrieve user details");
        }
    }

    // Update User - Enhanced with comprehensive validation and duplicate checks
    async updateUser(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            console.log(`🚀 [ADMIN API CALLED] ================================`);
            console.log(`🚀 [ADMIN API] Method: UPDATE USER`);
            console.log(`🚀 [ADMIN API] URL: ${req.originalUrl}`);
            console.log(`🚀 [ADMIN API] User-Agent: ${req.get('User-Agent')}`);
            console.log(`🚀 [ADMIN API] IP: ${req.ip || req.connection.remoteAddress}`);
            console.log(`🚀 [ADMIN API] Deployment: ${process.env.VERCEL_URL || 'LOCAL'}`);
            console.log(`🚀 [ADMIN API] Request ID: ${requestId}`);
            console.log(`🚀 [ADMIN API] ================================`);
            console.log(`✏️ [${requestId}] AdminAuthController.updateUser START`);
            console.log(`✏️ [${requestId}] Admin: ${req.user._id} (${req.user.email})`);
            console.log(`✏️ [${requestId}] Target user ID: ${req.params.userId}`);
            console.log(`✏️ [${requestId}] Update data:`, req.body);

            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();

            const { userId } = req.params;
            const { name, email, phone, gender, age, profileCompleted, status } = req.body;

            // Validate userId format
            if (!userId || userId.length !== 24) {
                console.log(`✏️ [${requestId}] Invalid user ID format: ${userId}`);
                return ResponseHandler.error(res, "Invalid user ID", "User ID must be a valid 24-character MongoDB ObjectId", 400);
            }
            
            // Validate ObjectId format
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                console.log(`✏️ [${requestId}] Invalid ObjectId format: ${userId}`);
                return ResponseHandler.error(res, "Invalid user ID", "User ID must be a valid MongoDB ObjectId", 400);
            }

            // Find the user to update
            console.log(`✏️ [${requestId}] Looking for user in database...`);
            const userToUpdate = await User.findById(userId);

            if (!userToUpdate) {
                console.log(`✏️ [${requestId}] User not found: ${userId}`);
                return ResponseHandler.error(res, "User not found", "The specified user does not exist", 404);
            }

            // Prevent updating other admins
            if (userToUpdate.role === 'admin') {
                console.log(`✏️ [${requestId}] Attempting to update another admin: ${userToUpdate.email}`);
                return ResponseHandler.error(res, "Action not allowed", "Cannot update admin accounts", 403);
            }

            console.log(`✏️ [${requestId}] Found user to update: ${userToUpdate.name} (${userToUpdate.email || userToUpdate.phone})`);

            // Prepare update data
            const updateData = {};
            let hasUpdates = false;

            // Update name if provided
            if (name !== undefined && name.trim() !== '') {
                const trimmedName = name.trim();
                
                // Validate name format - should contain at least one letter
                const nameRegex = /^[a-zA-Z\s\-\.\']+$/; // Allow letters, spaces, hyphens, dots, apostrophes
                const hasLetter = /[a-zA-Z]/.test(trimmedName); // Must contain at least one letter
                
                if (!nameRegex.test(trimmedName)) {
                    return ResponseHandler.error(res, "Validation failed", "Name can only contain letters, spaces, hyphens, dots, and apostrophes", 400);
                }
                
                if (!hasLetter) {
                    return ResponseHandler.error(res, "Validation failed", "Name must contain at least one letter", 400);
                }
                
                if (trimmedName.length < 2) {
                    return ResponseHandler.error(res, "Validation failed", "Name must be at least 2 characters long", 400);
                }
                
                if (trimmedName.length > 50) {
                    return ResponseHandler.error(res, "Validation failed", "Name must be less than 50 characters", 400);
                }
                
                updateData.name = trimmedName;
                hasUpdates = true;
                console.log(`✏️ [${requestId}] Updating name: ${userToUpdate.name} → ${trimmedName}`);
            }

            // Update email if provided
            if (email !== undefined) {
                if (email.trim() === '') {
                    updateData.email = null; // Allow removing email
                } else {
                    // Basic email validation
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                        return ResponseHandler.error(res, "Validation failed", "Invalid email format", 400);
                    }
                    
                    const cleanEmail = email.toLowerCase().trim();
                    
                    // Check for duplicate email (exclude current user)
                    console.log(`✏️ [${requestId}] Checking email duplicate for: ${cleanEmail}, excluding user: ${userId}`);
                    
                    try {
                        const existingUser = await User.findOne({ 
                            email: cleanEmail, 
                            _id: { $ne: new mongoose.Types.ObjectId(userId) } 
                        });
                        
                        if (existingUser) {
                            console.log(`✏️ [${requestId}] Duplicate email found: ${cleanEmail} used by user: ${existingUser._id}`);
                            return ResponseHandler.error(res, "Validation failed", "Email is already in use by another user", 400);
                        }
                        
                        console.log(`✏️ [${requestId}] Email available: ${cleanEmail}`);
                    } catch (mongoError) {
                        console.error(`✏️ [${requestId}] MongoDB error during email check:`, mongoError);
                        return ResponseHandler.error(res, "Database error", "Failed to validate email uniqueness", 500);
                    }
                    
                    updateData.email = cleanEmail;
                }
                hasUpdates = true;
                console.log(`✏️ [${requestId}] Updating email: ${userToUpdate.email} → ${updateData.email}`);
            }

            // Update phone if provided
            if (phone !== undefined && phone.trim() !== '') {
                // Basic phone validation (10-15 digits)
                const phoneRegex = /^[0-9]{10,15}$/;
                const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits
                if (!phoneRegex.test(cleanPhone)) {
                    return ResponseHandler.error(res, "Validation failed", "Phone number must be 10-15 digits", 400);
                }
                
                // Check for duplicate phone (exclude current user)
                const existingUser = await User.findOne({ 
                    phone: cleanPhone, 
                    _id: { $ne: new mongoose.Types.ObjectId(userId) } 
                });
                
                if (existingUser) {
                    console.log(`✏️ [${requestId}] Duplicate phone found: ${cleanPhone}`);
                    return ResponseHandler.error(res, "Validation failed", "Phone number is already in use by another user", 400);
                }
                
                updateData.phone = cleanPhone;
                hasUpdates = true;
                console.log(`✏️ [${requestId}] Updating phone: ${userToUpdate.phone} → ${cleanPhone}`);
            }

            // Update gender if provided
            if (gender !== undefined) {
                if (gender.trim() === '') {
                    updateData.gender = null; // Allow removing gender
                } else {
                    const validGenders = ['male', 'female', 'other'];
                    if (!validGenders.includes(gender.toLowerCase())) {
                        return ResponseHandler.error(res, "Validation failed", "Gender must be: male, female, or other", 400);
                    }
                    updateData.gender = gender.toLowerCase();
                }
                hasUpdates = true;
                console.log(`✏️ [${requestId}] Updating gender: ${userToUpdate.gender} → ${updateData.gender}`);
            }

            // Update age if provided
            if (age !== undefined) {
                if (age === '' || age === null) {
                    updateData.age = null; // Allow removing age
                } else {
                    const ageNum = parseInt(age);
                    if (isNaN(ageNum) || ageNum < 1 || ageNum > 150) {
                        return ResponseHandler.error(res, "Validation failed", "Age must be between 1 and 150", 400);
                    }
                    updateData.age = ageNum;
                }
                hasUpdates = true;
                console.log(`✏️ [${requestId}] Updating age: ${userToUpdate.age} → ${updateData.age}`);
            }

            // Update profile completion status if provided
            if (profileCompleted !== undefined) {
                updateData.profileCompleted = Boolean(profileCompleted);
                hasUpdates = true;
                console.log(`✏️ [${requestId}] Updating profileCompleted: ${userToUpdate.profileCompleted} → ${updateData.profileCompleted}`);
            }

            // Update status if provided (convert to isActive field)
            if (status !== undefined) {
                const validStatuses = ['Active', 'Inactive'];
                if (!validStatuses.includes(status)) {
                    return ResponseHandler.error(res, "Validation failed", "Status must be 'Active' or 'Inactive'", 400);
                }
                updateData.isActive = (status === 'Active');
                hasUpdates = true;
                console.log(`✏️ [${requestId}] Updating status: ${userToUpdate.isActive ? 'Active' : 'Inactive'} → ${status}`);
            }

            // Check if any updates were provided
            if (!hasUpdates) {
                return ResponseHandler.error(res, "No updates provided", "At least one field must be provided for update", 400);
            }

            // Update the user
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                updateData,
                { 
                    new: true, // Return updated document
                    runValidators: true // Run mongoose validators
                }
            );

            console.log(`✏️ [${requestId}] User successfully updated: ${updatedUser.name}`);

            return ResponseHandler.success(res, "User updated successfully", {
                updatedUser: {
                    id: updatedUser._id,
                    name: updatedUser.name || 'New User',
                    email: updatedUser.email || 'Not provided',
                    phone: updatedUser.phone,
                    gender: updatedUser.gender || 'Not specified',
                    age: updatedUser.age || 'Not specified',
                    profileCompleted: updatedUser.profileCompleted,
                    status: updatedUser.isActive ? 'Active' : 'Inactive',
                    updatedAt: new Date().toISOString()
                },
                updatedBy: {
                    adminId: req.user._id,
                    adminEmail: req.user.email
                },
                changedFields: Object.keys(updateData)
            });

        } catch (error) {
            console.error(`✏️ [${requestId}] Update user error:`, error);
            
            if (error.name === 'ValidationError') {
                return ResponseHandler.error(res, "Validation failed", error.message, 400);
            }
            
            if (error.name === 'CastError') {
                return ResponseHandler.error(res, "Invalid request", "Invalid user ID format", 400);
            }
            
            return ResponseHandler.serverError(res, "Failed to update user");
        }
    }
}

module.exports = new AdminAuthController();
