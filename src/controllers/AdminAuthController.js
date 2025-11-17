// Admin Authentication Controller
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const EmailService = require('../services/emailService');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');
const {Parser}=require('json2csv');
const otpmodel = require('../models/OTP');
const dailyHealthData = require('../models/DailyHealthData');
const Goals = require('../models/Goals');

const ConnectionHelper = require('../utils/connectionHelper');

async function fetchUsers(queryParams) {
    const requestId = `admin-fetchusers_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    Logger.info('FetchUsers helper START', requestId, { 
        hasFilters: Object.keys(queryParams).length > 0 
    });

    await ConnectionHelper.ensureConnection();

    // Extract filter parameters
    const profileCompleted = queryParams.profileCompleted;
    const gender = queryParams.gender;
    const age_min = parseInt(queryParams.age_min);
    const age_max = parseInt(queryParams.age_max);
    const searchTerm = queryParams.search;

    Logger.info('Filter parameters extracted', requestId, {
        profileCompleted,
        gender,
        age_min,
        age_max,
        searchTerm: searchTerm ? 'provided' : 'none'
    });

    // Build MongoDB query
    const userQuery = { role: 'user' };

    // Profile completed filter
    if (profileCompleted === 'true') {
        userQuery.profileCompleted = true;
        Logger.info('Applied filter: profileCompleted = true', requestId);
    } else if (profileCompleted === 'false') {
        userQuery.profileCompleted = false;
        Logger.info('Applied filter: profileCompleted = false', requestId);
    }

    // Gender filter
    if (gender && ['male', 'female', 'other'].includes(gender.toLowerCase())) {
        userQuery.gender = gender.toLowerCase();
        Logger.info('Applied filter: gender', requestId, { gender: gender.toLowerCase() });
    }

    // Age range filter
    if (!isNaN(age_min) || !isNaN(age_max)) {
        userQuery.age = {};
        if (!isNaN(age_min)) {
            userQuery.age.$gte = age_min;
            Logger.info('Applied filter: age min', requestId, { age_min });
        }
        if (!isNaN(age_max)) {
            userQuery.age.$lte = age_max;
            Logger.info('Applied filter: age max', requestId, { age_max });
        }
    }

    // Search filter
    if (searchTerm && searchTerm.trim() !== '') {
        Logger.info('Applied search filter', requestId, { searchTerm });
        const searchRegex = new RegExp(searchTerm.trim(), 'i');
        userQuery.$or = [
            { name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex }
        ];
    }

    // Execute the query
    const users = await User.find(userQuery)
        .select('name email gender age phone profileCompleted isActive signupAt lastLoginAt')
        .sort({ signupAt: -1 })
        .lean();

    Logger.info('FetchUsers helper COMPLETE', requestId, { 
        foundUsers: users.length 
    });
    
    return users;
}




class AdminAuthController {
    // Generate JWT token
    generateToken(userId) {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable is required');
        }

        return jwt.sign(
            { userId },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
    }

    // Admin Signup
    async signup(req, res) {
        const requestId = `admin-signup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Admin signup START', requestId, { 
                url: req.originalUrl,
                ip: req.ip || req.connection.remoteAddress 
            });
            
            const { name, email, password } = req.body;
            
            // Basic validation
            if (!name || !email || !password) {
                Logger.warn('Missing required fields', requestId);
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Name, email, and password are required",
                    400,
                    'ADMIN_MISSING_FIELDS'
                );
            }

            // Validate name format
            const trimmedName = name.trim();
            const nameRegex = /^[a-zA-Z\s\-\.\']+$/; // Allow letters, spaces, hyphens, dots, apostrophes
            const hasLetter = /[a-zA-Z]/.test(trimmedName); // Must contain at least one letter
            
            if (!nameRegex.test(trimmedName)) {
                Logger.warn('Invalid name format', requestId, { name: trimmedName });
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Name can only contain letters, spaces, hyphens, dots, and apostrophes", 
                    400,
                    'ADMIN_INVALID_NAME_FORMAT'
                );
            }
            
            if (!hasLetter) {
                Logger.warn('Name must contain letters', requestId);
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Name must contain at least one letter", 
                    400,
                    'ADMIN_NAME_NO_LETTERS'
                );
            }
            
            if (trimmedName.length < 2) {
                Logger.warn('Name too short', requestId, { length: trimmedName.length });
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Name must be at least 2 characters long", 
                    400,
                    'ADMIN_NAME_TOO_SHORT'
                );
            }
            
            if (trimmedName.length > 50) {
                Logger.warn('Name too long', requestId, { length: trimmedName.length });
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Name must be less than 50 characters", 
                    400,
                    'ADMIN_NAME_TOO_LONG'
                );
            }

            if (password.length < (parseInt(process.env.ADMIN_MIN_PASSWORD_LENGTH) || 6)) {
                Logger.warn('Password too short', requestId);
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    `Password must be at least ${parseInt(process.env.ADMIN_MIN_PASSWORD_LENGTH) || 6} characters long`,
                    400,
                    'ADMIN_PASSWORD_TOO_SHORT'
                );
            }

            // Ensure MongoDB connection is ready
            Logger.info('Ensuring MongoDB connection', requestId);
            await ConnectionHelper.ensureConnection();

            // Check if admin with this email already exists
            Logger.info('Checking for existing admin', requestId, { email });
            const existingAdmin = await User.findOne({ email: email.toLowerCase(), role: 'admin' });
            
            if (existingAdmin) {
                Logger.warn('Admin already exists', requestId, { email });
                return ResponseHandler.error(
                    res, 
                    "Registration failed", 
                    "Admin with this email already exists",
                    400,
                    'ADMIN_EMAIL_EXISTS'
                );
            }

            // Hash password
            Logger.info('Hashing password', requestId);
            const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create new admin user
            Logger.info('Creating new admin user', requestId);
            const newAdmin = new User({
                name: name.trim(),
                email: email.toLowerCase().trim(),
                password: hashedPassword,
                role: 'admin',
                profileCompleted: false, // Keep false for admin users - they don't need user profile fields
                signupAt: new Date()
            });

            const savedAdmin = await newAdmin.save();
            Logger.info('New admin created successfully', requestId, { 
                adminId: savedAdmin._id,
                email: savedAdmin.email 
            });

            // Generate JWT token
            Logger.info('Generating JWT token', requestId);
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
            Logger.error('Admin signup error', requestId, { 
                errorName: error.name, 
                errorMessage: error.message 
            });
            return ResponseHandler.serverError(res, "Registration failed", 'ADMIN_SIGNUP_FAILED');
        }
    }

    // Admin Login
    async login(req, res) {
        const requestId = `admin-login_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Admin login START', requestId, { 
                url: req.originalUrl,
                ip: req.ip || req.connection.remoteAddress 
            });
            
            const { email, password } = req.body;
            
            // Basic validation
            if (!email || !password) {
                Logger.warn('Missing required fields', requestId);
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Email and password are required", 
                    400,
                    'ADMIN_LOGIN_MISSING_FIELDS'
                );
            }

            // Ensure MongoDB connection is ready
            Logger.info('Ensuring MongoDB connection', requestId);
            try {
                await ConnectionHelper.ensureConnection();
            } catch (connectionError) {
                Logger.error('Database connection failed', requestId, { error: connectionError.message });
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Database connection failed. Please try again later.", 
                    503,
                    'ADMIN_DB_CONNECTION_FAILED'
                );
            }

            // Find admin user
            Logger.info('Looking for admin user', requestId, { email });
            let admin;
            try {
                admin = await User.findOne({ 
                    email: email.toLowerCase(), 
                    role: 'admin' 
                });
            } catch (dbError) {
                Logger.error('Database query failed', requestId, { error: dbError.message });
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Database query failed. Please try again later.", 
                    500,
                    'ADMIN_DB_QUERY_FAILED'
                );
            }

            if (!admin) {
                Logger.warn('Admin not found', requestId, { email });
                return ResponseHandler.error(
                    res, 
                    "Login failed", 
                    "Invalid email or password", 
                    401,
                    'ADMIN_INVALID_CREDENTIALS'
                );
            }

            // Verify password
            Logger.info('Verifying password', requestId);
            let isPasswordValid;
            try {
                isPasswordValid = await bcrypt.compare(password, admin.password);
            } catch (bcryptError) {
                Logger.error('Password verification failed', requestId, { error: bcryptError.message });
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Password verification failed. Please try again later.", 
                    500,
                    'ADMIN_PASSWORD_VERIFY_FAILED'
                );
            }

            if (!isPasswordValid) {
                Logger.warn('Invalid password', requestId, { email });
                return ResponseHandler.error(
                    res, 
                    "Login failed", 
                    "Invalid email or password", 
                    401,
                    'ADMIN_INVALID_CREDENTIALS'
                );
            }

            // Generate JWT token with admin ID first to get the exact iat
            Logger.info('Generating JWT token', requestId, { adminId: admin._id });
            let token;
            try {
                const adminController = new AdminAuthController();
                token = adminController.generateToken(admin._id);
            } catch (jwtError) {
                Logger.error('JWT generation failed', requestId, { error: jwtError.message });
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Token generation failed. Please check server configuration.", 
                    500,
                    'ADMIN_JWT_GENERATION_FAILED'
                );
            }
            
            // Extract the iat from the token to set lastLoginAt safely before it
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (jwtVerifyError) {
                Logger.error('JWT verification failed', requestId, { error: jwtVerifyError.message });
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Token verification failed. Please try again later.", 
                    500,
                    'ADMIN_JWT_VERIFY_FAILED'
                );
            }
            
            const tokenIssuedAt = new Date(decoded.iat * 1000); // Convert to milliseconds
            
            Logger.info('Updating lastLoginAt', requestId, { 
                tokenIssuedAt: tokenIssuedAt.toISOString() 
            });
            
            admin.lastLoginAt = new Date(tokenIssuedAt.getTime() - 1000); // 1 second before
            
            // Save admin with updated lastLoginAt
            try {
                await admin.save();
            } catch (saveError) {
                Logger.warn('Failed to save admin lastLoginAt', requestId, { error: saveError.message });
                // Don't fail the login for this - just log the error
            }

            Logger.info('Admin login successful', requestId, { 
                adminId: admin._id,
                email: admin.email 
            });

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
            Logger.error('Admin login error', requestId, { 
                errorName: error.name, 
                errorMessage: error.message 
            });
            
            // Handle specific error types
            if (error.name === 'ValidationError') {
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Invalid input data provided", 
                    400,
                    'ADMIN_VALIDATION_ERROR'
                );
            }
            
            if (error.name === 'MongoNetworkError' || error.name === 'MongoServerError') {
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Database connection issue. Please try again later.", 
                    503,
                    'ADMIN_MONGO_ERROR'
                );
            }
            
            if (error.name === 'JsonWebTokenError') {
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Authentication token error. Please try again later.", 
                    500,
                    'ADMIN_JWT_ERROR'
                );
            }
            
            // Generic server error for unhandled cases
            return ResponseHandler.error(
                res, 
                "Server error", 
                "Login failed. Please try again later.", 
                500,
                'ADMIN_LOGIN_FAILED'
            );
        }
    }

    // Get admin profile
    async getProfile(req, res) {
        const requestId = `admin-profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Get admin profile START', requestId, { 
                ip: req.ip || req.connection.remoteAddress 
            });
            
            const admin = req.user;
            Logger.info('Fetching profile for admin', requestId, { 
                adminId: admin._id,
                email: admin.email 
            });
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Validate admin exists and has proper role
            if (!admin || admin.role !== 'admin') {
                Logger.warn('Invalid admin access attempt', requestId, { 
                    userId: admin ? admin._id : 'null', 
                    role: admin ? admin.role : 'null' 
                });
                return ResponseHandler.error(
                    res, 
                    "Access denied", 
                    "Invalid admin credentials", 
                    403,
                    'ADMIN_ACCESS_DENIED'
                );
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
            
            Logger.info('Admin profile fetched successfully', requestId, { 
                adminId: admin._id 
            });
            
            return ResponseHandler.success(res, "Admin profile fetched successfully", profileData);
            
        } catch (error) {
            Logger.error('Get admin profile error', requestId, { 
                errorName: error.name, 
                errorMessage: error.message 
            });
            
            // Handle specific error types
            if (error.name === 'CastError') {
                return ResponseHandler.error(
                    res, 
                    "Invalid request", 
                    "Invalid admin ID format", 
                    400,
                    'ADMIN_INVALID_ID'
                );
            }
            
            return ResponseHandler.serverError(res, "Failed to fetch admin profile", 'ADMIN_PROFILE_FETCH_FAILED');
        }
    }

    // Request password reset for admin (POST /admin/forgot-password)
    async forgotPassword(req, res) {
        const requestId = `admin-forgot-password_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Admin forgot password START', requestId, { 
                ip: req.ip || req.connection.remoteAddress,
                frontendUrl: process.env.FRONTEND_URL 
            });

            const { email } = req.body;

            // Validate email
            if (!email) {
                Logger.warn('Email required for password reset', requestId);
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Email is required", 
                    400,
                    'ADMIN_EMAIL_REQUIRED'
                );
            }

            // Ensure MongoDB connection
            await ConnectionHelper.ensureConnection();

            // Only allow admin users to reset password
            const admin = await User.findOne({ 
                email: email.toLowerCase().trim(),
                role: 'admin'
            });
            
            // For security reasons, we'll always return success even if admin doesn't exist
            // This prevents email enumeration attacks
            if (!admin) {
                Logger.info('Admin not found for password reset', requestId, { email });
                // Still return success to prevent email enumeration
                return ResponseHandler.success(res, "If an admin account with this email exists, we'll send you a password reset link. The link will expire in 24 hours. Please also check your spam folder if you don't see the email.");
            }

            // Generate unique token
            const resetToken = uuidv4();
            Logger.info('Generated reset token', requestId, { 
                adminId: admin._id,
                tokenPrefix: resetToken.substring(0, 8) 
            });

            // Set token to expire in 24 hours
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            // Delete any existing password reset tokens for this admin
            await PasswordReset.deleteMany({ userId: admin._id });
            Logger.info('Deleted existing reset tokens', requestId, { adminId: admin._id });

            // Save new token in PasswordReset collection
            const passwordReset = new PasswordReset({
                userId: admin._id,
                token: resetToken,
                expiresAt: expiresAt
            });

            await passwordReset.save();
            Logger.info('Password reset token saved', requestId, { expiresAt });

            // Generate reset link for frontend (environment-based URL)
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
            const resetLink = `${frontendUrl}/admin/reset-password?token=${resetToken}`;
            Logger.info('Generated reset link', requestId, { frontendUrl });

            // Initialize email service
            const emailService = new EmailService();

            // Test email connection before sending
            try {
                const isEmailConfigured = await emailService.testConnection();
                if (!isEmailConfigured) {
                    Logger.error('Email service not configured', requestId);
                    return ResponseHandler.error(
                        res, 
                        "Server error", 
                        "Email service is not configured. Please contact the system administrator.", 
                        503,
                        'ADMIN_EMAIL_NOT_CONFIGURED'
                    );
                }
            } catch (testError) {
                Logger.error('Email connection test failed', requestId, { 
                    errorMessage: testError.message 
                });
                return ResponseHandler.error(
                    res, 
                    "Server error", 
                    "Email service connection failed. Please contact the system administrator.", 
                    503,
                    'ADMIN_EMAIL_CONNECTION_FAILED'
                );
            }

            // Send admin password reset email with actual link
            try {
                const emailResult = await emailService.sendAdminPasswordResetEmail(
                    admin.email,
                    admin.name || 'Admin',
                    resetLink
                );
                Logger.info('Admin password reset email sent', requestId, { 
                    messageId: emailResult.messageId 
                });
            } catch (emailError) {
                Logger.error('Email sending failed', requestId, { 
                    errorMessage: emailError.message 
                });
                // Delete the token if email fails
                await PasswordReset.deleteOne({ token: resetToken });
                Logger.info('Token deleted due to email failure', requestId);
                // Still return success to prevent email enumeration
            }

            return ResponseHandler.success(res, "If an admin account with this email exists, we'll send you a password reset link. The link will expire in 24 hours. Please also check your spam folder if you don't see the email.");

        } catch (error) {
            Logger.error('Admin forgot password error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            return ResponseHandler.error(
                res, 
                "Server error", 
                "Failed to process password reset request. Please try again later.", 
                500,
                'ADMIN_PASSWORD_RESET_FAILED'
            );
        }
    }

    // Reset password with token (POST /admin/reset-password)
    async resetPassword(req, res) {
        const requestId = `admin-reset-password_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Admin reset password START', requestId, { 
                ip: req.ip || req.connection.remoteAddress,
                tokenProvided: !!req.body.token,
                passwordProvided: !!req.body.password
            });

            const { token, password } = req.body;

            // Validate input
            if (!token || !password) {
                Logger.warn('Missing required fields for password reset', requestId);
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    "Token and password are required", 
                    400,
                    'ADMIN_RESET_MISSING_FIELDS'
                );
            }

            const minPasswordLength = parseInt(process.env.ADMIN_MIN_PASSWORD_LENGTH) || 6;
            if (password.length < minPasswordLength) {
                Logger.warn('Password too short', requestId, { 
                    providedLength: password.length,
                    requiredLength: minPasswordLength 
                });
                return ResponseHandler.error(
                    res, 
                    "Validation failed", 
                    `Password must be at least ${minPasswordLength} characters long`, 
                    400,
                    'ADMIN_PASSWORD_TOO_SHORT'
                );
            }

            // Ensure MongoDB connection
            await ConnectionHelper.ensureConnection();

            // Find the password reset record
            const passwordReset = await PasswordReset.findOne({ 
                token: token,
                used: false,
                expiresAt: { $gt: new Date() }
            }).populate('userId');

            if (!passwordReset) {
                Logger.warn('Invalid or expired reset token', requestId, { 
                    tokenPrefix: token.substring(0, 8) 
                });
                return ResponseHandler.error(
                    res, 
                    "Invalid token", 
                    "Invalid or expired reset token", 
                    400,
                    'ADMIN_RESET_INVALID_TOKEN'
                );
            }

            const admin = passwordReset.userId;

            // Verify it's an admin user
            if (!admin || admin.role !== 'admin') {
                Logger.warn('Reset token not associated with admin user', requestId, { 
                    userId: admin ? admin._id : 'null',
                    role: admin ? admin.role : 'null' 
                });
                return ResponseHandler.error(
                    res, 
                    "Invalid token", 
                    "Invalid reset token", 
                    400,
                    'ADMIN_RESET_INVALID_TOKEN'
                );
            }

            // Hash new password
            Logger.info('Hashing new password', requestId, { adminId: admin._id });
            const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Update admin password
            admin.password = hashedPassword;
            admin.lastLoginAt = new Date(); // Invalidate existing sessions for security
            await admin.save();

            // Mark token as used and delete it
            await PasswordReset.deleteOne({ _id: passwordReset._id });
            Logger.info('Password reset completed successfully', requestId, { 
                adminId: admin._id,
                email: admin.email 
            });

            return ResponseHandler.success(res, "Password has been reset successfully. You can now login with your new password.");

        } catch (error) {
            Logger.error('Admin reset password error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            return ResponseHandler.error(
                res, 
                "Server error", 
                "Failed to reset password. Please try again later.", 
                500,
                'ADMIN_RESET_PASSWORD_FAILED'
            );
        }
    }

   
    // Delete User and return updated list with pagination
    async deleteUser(req, res) {
        const requestId = `admin-delete-user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Admin delete user START', requestId, { 
                userId: req.params.userId,
                ip: req.ip || req.connection.remoteAddress
            });
            
            // Ensure database connection
            await ConnectionHelper.ensureConnection();

            const { userId } = req.params;
            const { 
                page = 1, 
                limit = 10, 
                search = '', 
                status = '' 
            } = req.body;

            Logger.info('Deleting user', requestId, { userId });
            
            // 1. Check if user exists and is not an admin
            const userToDelete = await User.findById(userId);
            if (!userToDelete) {
                Logger.warn('User not found for deletion', requestId, { userId });
                return ResponseHandler.error(
                    res, 
                    "User not found", 
                    "The specified user does not exist", 
                    404,
                    'ADMIN_USER_NOT_FOUND'
                );
            }

            if (userToDelete.role === 'admin') {
                Logger.warn('Attempted to delete admin user', requestId, { 
                    userId,
                    email: userToDelete.email 
                });
                return ResponseHandler.error(
                    res, 
                    "Cannot delete admin", 
                    "Admin users cannot be deleted", 
                    403,
                    'ADMIN_CANNOT_DELETE_ADMIN'
                );
            }

            // 2. Delete the user from database
            await User.findByIdAndDelete(userId);
            Logger.info('User deleted successfully', requestId, { userId });

            // delete related data if any (e.g., password resets,healthdata,workoutdata,goals,otp)
            await PasswordReset.deleteMany({ userId: userId });
            await dailyHealthData.deleteMany({ userId: userId });
            await otpmodel.deleteMany({ userId: userId });
            await Goals.deleteMany({ userId: userId });

            Logger.info('Related user data deleted', requestId, { userId });

            // 3. Fetch all users (exclude admins from the list)
            let users = await User.find({ role: { $ne: 'admin' } })
                .select('name email phone gender age profileCompleted status signupAt lastLoginAt')
                .lean();

            Logger.info('Fetched users for updated list', requestId, { 
                totalUsers: users.length 
            });

            // 4. Apply search filtering
            if (search && search.trim()) {
                const searchLower = search.toLowerCase().trim();
                users = users.filter(user => 
                    user.name?.toLowerCase().includes(searchLower) ||
                    user.email?.toLowerCase().includes(searchLower) ||
                    user.phone?.includes(search.trim())
                );
                Logger.info('Applied search filter', requestId, { 
                    searchTerm: search,
                    filteredCount: users.length 
                });
            }

            // 5. Apply status filtering
            if (status && status.trim()) {
                users = users.filter(user => user.status === status);
                Logger.info('Applied status filter', requestId, { 
                    status,
                    filteredCount: users.length 
                });
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

            Logger.info('User deletion completed', requestId, { 
                returnedUsers: formattedUsers.length,
                totalUsers: totalUsers,
                currentPage: currentPage 
            });
            
            return ResponseHandler.success(res, "User deleted successfully", responseData);

        } catch (error) {
            Logger.error('Admin delete user error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            
            // Handle specific error types
            if (error.name === 'CastError') {
                return ResponseHandler.error(
                    res, 
                    "Invalid request", 
                    "Invalid user ID format", 
                    400,
                    'ADMIN_INVALID_USER_ID'
                );
            }
            
            return ResponseHandler.error(
                res, 
                "Server error", 
                "Failed to delete user. Please try again later.", 
                500,
                'ADMIN_DELETE_USER_FAILED'
            );
        }
    } 
 

    // ============================================
    // Dashboard Function - Use fetchUsers()
    // ============================================
    async dashboard(req, res) {
        const requestId = `admin-dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        Logger.info('Admin dashboard START', requestId, { 
            ip: req.ip || req.connection.remoteAddress,
            queryParams: req.query
        });

        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 10, 50);

            Logger.info('Dashboard pagination', requestId, { page, limit });

            // Use fetchUsers helper to get filtered users
            const allFilteredUsers = await fetchUsers(req.query);
            
            Logger.info('FetchUsers completed', requestId, { 
                totalFilteredUsers: allFilteredUsers.length 
            });

            // Calculate pagination
            const totalFilteredUsers = allFilteredUsers.length;
            const totalPages = Math.ceil(totalFilteredUsers / limit);
            const skip = (page - 1) * limit;
            const usersForCurrentPage = allFilteredUsers.slice(skip, skip + limit);

            Logger.info('Pagination calculated', requestId, { 
                currentPageUsers: usersForCurrentPage.length,
                totalPages 
            });

            // Format users
            const formattedUsers = usersForCurrentPage.map(user => ({
                id: user._id,
                name: user.name || 'New User',
                email: user.email || 'Not provided',
                phone: user.phone || 'Not provided',
                gender: user.gender || 'Not specified',
                age: user.age || 'Not specified',
                profileCompleted: user.profileCompleted || false,
                status: user.isActive ? 'Active' : 'Inactive',
                signupDate: user.signupAt,
                lastLogin: user.lastLoginAt || 'Never'
            }));

            // Response
            const responseData = {
                users: formattedUsers,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalUsers: totalFilteredUsers,
                    usersPerPage: limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                },
                appliedFilters: {
                    search: req.query.search || null,
                    profileCompleted: req.query.profileCompleted || null,
                    gender: req.query.gender || null,
                    age: { 
                        min: req.query.age_min || null, 
                        max: req.query.age_max || null 
                    }
                },
                stats: {
                    totalUsers: totalFilteredUsers,
                    activeUsers: allFilteredUsers.filter(u => u.isActive).length,
                    completedProfiles: allFilteredUsers.filter(u => u.profileCompleted).length
                }
            };

            Logger.info('Dashboard data ready', requestId, { 
                returnedUsers: formattedUsers.length 
            });
            
            return ResponseHandler.success(res, "Dashboard data retrieved successfully", responseData);

        } catch (error) {
            Logger.error('Dashboard error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            return ResponseHandler.error(
                res, 
                "Server error", 
                "Failed to load dashboard data", 
                500,
                'ADMIN_DASHBOARD_FAILED'
            );
        }
    }

    // ============================================
    // Export Dashboard Data - Use fetchUsers()
    // ============================================
    async exportDashboardData(req, res) {
        const requestId = `admin-export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        Logger.info('Export dashboard data START', requestId, { 
            ip: req.ip || req.connection.remoteAddress,
            queryParams: req.query 
        });

        try {
            // Use fetchUsers helper to get filtered users
            const users = await fetchUsers(req.query);

            Logger.info('Users fetched for export', requestId, { 
                totalUsers: users.length 
            });

            if (!users || users.length === 0) {
                Logger.warn('No users found for export', requestId);
                return ResponseHandler.error(
                    res, 
                    'No data available', 
                    'No users found matching your filters', 
                    404,
                    'ADMIN_NO_EXPORT_DATA'
                );
            }

            const fields = [
                { label: 'Name', value: 'name' },
                { label: 'Email', value: 'email' },
                { label: 'Phone', value: 'phone' },
                { label: 'Gender', value: 'gender' },
                { label: 'Age', value: 'age' },
                { label: 'Status', value: row => (row.isActive ? 'Active' : 'Inactive') },
                { label: 'Profile Completed', value: row => (row.profileCompleted ? 'Complete' : 'Incomplete') },
            ];

            const json2csv = new Parser({ fields });
            const csv = json2csv.parse(users);

            Logger.info('CSV generated successfully', requestId, { 
                exportedUsers: users.length 
            });

            res.header('Content-Type', 'text/csv');
            res.attachment('dashboard_export.csv');
            res.send(csv);

        } catch (error) {
            Logger.error('Export dashboard error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            return ResponseHandler.error(
                res, 
                'Server error', 
                'Failed to export CSV', 
                500,
                'ADMIN_EXPORT_FAILED'
            );
        }
    }


// Admin Logout - Enhanced with admin-specific tracking and security monitoring
    async logout(req, res) {
        const requestId = `admin-logout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Admin logout START', requestId, { 
                ip: req.ip || req.connection.remoteAddress,
                adminId: req.user._id
            });
            
            const admin = req.user;
            Logger.info('Admin logout initiated', requestId, { 
                adminId: admin._id,
                email: admin.email,
                role: admin.role 
            });
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Record logout timestamp for session invalidation
            const logoutTime = new Date();
            admin.lastLoginAt = logoutTime;
            await admin.save();
            
            Logger.info('Admin session invalidated', requestId, { 
                adminId: admin._id,
                email: admin.email,
                logoutTime: logoutTime.toISOString() 
            });
            
            return ResponseHandler.success(res, "Admin logged out successfully", {
                logoutTime: logoutTime.toISOString(),
                sessionInvalidated: true
            });
            
        } catch (error) {
            Logger.error('Admin logout error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            return ResponseHandler.error(
                res, 
                "Server error", 
                "Admin logout failed", 
                500,
                'ADMIN_LOGOUT_FAILED'
            );
        }
    }

    // Get Individual User Details - Enhanced with comprehensive validation and security
    async getUser(req, res) {
        const requestId = `admin-getuser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Admin get user START', requestId, { 
                adminId: req.user._id,
                targetUserId: req.params.userId,
                ip: req.ip || req.connection.remoteAddress
            });

            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();

            const { userId } = req.params;

            // Validate userId format
            if (!userId || userId.length !== 24) {
                Logger.warn('Invalid user ID format', requestId, { userId });
                return ResponseHandler.error(
                    res, 
                    "Invalid user ID", 
                    "User ID must be a valid 24-character MongoDB ObjectId", 
                    400,
                    'ADMIN_INVALID_USER_ID'
                );
            }

            // Find user by ID (exclude admin users from regular user lookup)
            Logger.info('Looking for user in database', requestId, { userId });
            const user = await User.findOne({ 
                _id: userId, 
                role: { $ne: 'admin' } // Exclude admin users for security
            }).lean();

            if (!user) {
                Logger.warn('User not found', requestId, { userId });
                return ResponseHandler.error(
                    res, 
                    "User not found", 
                    "The specified user does not exist", 
                    404,
                    'ADMIN_USER_NOT_FOUND'
                );
            }

            Logger.info('User found', requestId, { 
                userId: user._id,
                userName: user.name 
            });

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

            Logger.info('User details retrieved successfully', requestId, { 
                userId: user._id 
            });

            return ResponseHandler.success(res, "User details retrieved successfully", {
                user: userData,
                requestedBy: {
                    adminId: req.user._id,
                    adminEmail: req.user.email,
                    requestTime: new Date().toISOString()
                }
            });

        } catch (error) {
            Logger.error('Get user error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            
            if (error.name === 'CastError') {
                return ResponseHandler.error(
                    res, 
                    "Invalid request", 
                    "Invalid user ID format", 
                    400,
                    'ADMIN_INVALID_USER_ID'
                );
            }
            
            return ResponseHandler.error(
                res, 
                "Server error", 
                "Failed to retrieve user details", 
                500,
                'ADMIN_GET_USER_FAILED'
            );
        }
    }

async updateUser(req, res) {
    const requestId = `admin-update-user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        Logger.info('Admin update user START', requestId, { 
            adminId: req.user._id,
            targetUserId: req.params.userId,
            ip: req.ip || req.connection.remoteAddress
        });

        // Ensure MongoDB connection is ready
        await ConnectionHelper.ensureConnection();

        const { userId } = req.params;
        
        // Find the user to update
        Logger.info('Looking for user to update', requestId, { userId });
        const userToUpdate = await User.findById(userId);

        if (!userToUpdate) {
            Logger.warn('User not found for update', requestId, { userId });
            return ResponseHandler.error(
                res, 
                "User not found", 
                "The specified user does not exist", 
                404,
                'ADMIN_USER_NOT_FOUND'
            );
        }

        // Prevent updating other admins
        if (userToUpdate.role === 'admin') {
            Logger.warn('Attempted to update admin account', requestId, { 
                targetUserId: userId,
                targetEmail: userToUpdate.email 
            });
            return ResponseHandler.error(
                res, 
                "Action not allowed", 
                "Cannot update admin accounts", 
                403,
                'ADMIN_CANNOT_UPDATE_ADMIN'
            );
        }

        Logger.info('User found for update', requestId, { 
            userId: userToUpdate._id,
            userName: userToUpdate.name 
        });

        // Prepare update data
        const updateData = {};
        const allowedFields = ['name', 'email', 'phone', 'gender', 'age', 'profileCompleted', 'isActive'];
        
        // Build update data from validated req.body
        allowedFields.forEach(field => {
            if (req.body.hasOwnProperty(field)) {
                updateData[field] = req.body[field];
            }
        });

        // MongoDB Validation: Check for duplicate email (exclude current user)
        if (updateData.email && updateData.email !== null) {
            Logger.info('Checking email uniqueness', requestId, { 
                email: updateData.email 
            });
            
            try {
                const existingUser = await User.findOne({ 
                    email: updateData.email, 
                    _id: { $ne: new mongoose.Types.ObjectId(userId) } 
                });
                
                if (existingUser) {
                    Logger.warn('Duplicate email found', requestId, { 
                        email: updateData.email,
                        existingUserId: existingUser._id 
                    });
                    return ResponseHandler.error(
                        res, 
                        "Validation failed", 
                        "Email is already in use by another user", 
                        400,
                        'ADMIN_EMAIL_DUPLICATE'
                    );
                }
                
                Logger.info('Email available', requestId);
            } catch (mongoError) {
                Logger.error('MongoDB error during email check', requestId, { 
                    errorMessage: mongoError.message 
                });
                return ResponseHandler.error(
                    res, 
                    "Database error", 
                    "Failed to validate email uniqueness", 
                    500,
                    'ADMIN_DB_ERROR'
                );
            }
        }

        // MongoDB Validation: Check for duplicate phone (exclude current user)
        if (updateData.phone && updateData.phone !== '') {
            Logger.info('Checking phone uniqueness', requestId, { 
                phone: updateData.phone 
            });
            
            try {
                const existingUser = await User.findOne({ 
                    phone: updateData.phone, 
                    _id: { $ne: new mongoose.Types.ObjectId(userId) } 
                });
                
                if (existingUser) {
                    Logger.warn('Duplicate phone found', requestId, { 
                        phone: updateData.phone,
                        existingUserId: existingUser._id 
                    });
                    return ResponseHandler.error(
                        res, 
                        "Validation failed", 
                        "Phone number is already in use by another user", 
                        400,
                        'ADMIN_PHONE_DUPLICATE'
                    );
                }
                
                Logger.info('Phone available', requestId);
            } catch (mongoError) {
                Logger.error('MongoDB error during phone check', requestId, { 
                    errorMessage: mongoError.message 
                });
                return ResponseHandler.error(
                    res, 
                    "Database error", 
                    "Failed to validate phone uniqueness", 
                    500,
                    'ADMIN_DB_ERROR'
                );
            }
        }

        // Log what's being updated
        Object.keys(updateData).forEach(field => {
            Logger.info(`Updating ${field} field`, requestId, { 
                oldValue: userToUpdate[field],
                newValue: updateData[field] 
            });
        });

        // Update the user in MongoDB
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { 
                new: true,
                runValidators: true
            }
        );

        Logger.info('User updated successfully', requestId, { 
            userId: updatedUser._id,
            changedFields: Object.keys(updateData) 
        });

        return ResponseHandler.success(res, "User updated successfully", {
            updatedUser: {
                id: updatedUser._id,
                name: updatedUser.name || 'New User',
                email: updatedUser.email || 'Not provided',
                phone: updatedUser.phone,
                gender: updatedUser.gender || 'Not specified',
                age: updatedUser.age || 'Not specified',
                profileCompleted: updatedUser.profileCompleted,
                isActive: updatedUser.isActive,
                updatedAt: new Date().toISOString()
            },
            updatedBy: {
                adminId: req.user._id,
                adminEmail: req.user.email
            },
            changedFields: Object.keys(updateData)
        });

    } catch (error) {
        Logger.error('Update user error', requestId, { 
            errorName: error.name,
            errorMessage: error.message 
        });
        console.log(error);
        
        if (error.name === 'ValidationError') {
            return ResponseHandler.error(
                res, 
                "Validation failed", 
                error.message, 
                400,
                'ADMIN_VALIDATION_ERROR'
            );
        }
        
        if (error.name === 'CastError') {
            return ResponseHandler.error(
                res, 
                "Invalid request", 
                "Invalid user ID format", 
                400,
                'ADMIN_INVALID_USER_ID'
            );
        }
    
        return ResponseHandler.error(
            res, 
            "Server error", 
            "Failed to update user", 
            500,
            'ADMIN_UPDATE_USER_FAILED'
        );
    }
}

}

module.exports = new AdminAuthController();
