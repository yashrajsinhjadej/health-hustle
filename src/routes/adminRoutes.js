// Admin Routes - Simple admin endpoints
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken, adminOnly } = require('../middleware/auth');
const AdminAuthController = require('../controllers/AdminAuthController');
const AuthController = require('../controllers/AuthController');
const ResponseHandler = require('../utils/ResponseHandler');
const createCustomRateLimit = require('../middleware/customRateLimit');
const { 
    validateAdminSignup, 
    validateAdminLogin, 
    validateAdminEmail,
    validateAdminPasswordReset,
    handleValidationErrors 
} = require('../validators/userValidators');

// Create rate limiter for admin routes using environment variables
const adminRateLimit = createCustomRateLimit(
    parseInt(process.env.ADMIN_ROUTES_LIMIT) || 100, 
    parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
); // Admin routes rate limit from env

// Public admin auth routes (no authentication required)
router.post('/signup', adminRateLimit, validateAdminSignup, handleValidationErrors, AdminAuthController.signup);
router.post('/login', adminRateLimit, validateAdminLogin, handleValidationErrors, AdminAuthController.login);

// POST /admin/forgot-password - Request password reset for admin via email with reset link
router.post('/forgot-password', adminRateLimit, validateAdminEmail, handleValidationErrors, AdminAuthController.forgotPassword);

// GET /admin/reset-password - Show password reset form
router.get('/reset-password', AdminAuthController.showResetForm);

// POST /admin/reset-password - Process password reset with token
router.post('/reset-password', adminRateLimit, validateAdminPasswordReset, handleValidationErrors, AdminAuthController.resetPassword);

// GET /admin/forgot-password - Show forgot password form
router.get('/forgot-password', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Password Reset - Health Hustle</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input[type="email"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
                button { background-color: #e74c3c; color: white; padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
                button:hover { background-color: #c0392b; }
                .header { text-align: center; margin-bottom: 30px; }
                .header h1 { color: #e74c3c; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Health Hustle Admin</h1>
                <h2>Forgot Your Password?</h2>
                <p>Enter your admin email address and we'll send you a password reset link.</p>
            </div>
            
            <form method="POST" action="/api/admin/forgot-password">
                <div class="form-group">
                    <label for="email">Admin Email:</label>
                    <input type="email" id="email" name="email" required 
                           placeholder="Enter your admin email address">
                </div>
                
                <button type="submit">Send Reset Link</button>
            </form>
        </body>
        </html>
    `);
});

// Protected admin routes (authentication required)
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken);
protectedRouter.use(adminOnly);
protectedRouter.use(adminRateLimit);

// GET /admin/profile - Get admin profile
protectedRouter.get('/profile', AdminAuthController.getProfile);

// POST /admin/logout - Admin logout with enhanced tracking and security monitoring
protectedRouter.post('/logout', AdminAuthController.logout);

// GET /admin/dashboard - Enhanced admin dashboard with pagination and performance optimization
protectedRouter.get('/dashboard', AdminAuthController.dashboard);

// GET /admin/users/:userId - Get individual user details
protectedRouter.get('/users/:userId', AdminAuthController.getUser);

// DELETE /admin/users/:userId - Delete a user and return updated list with pagination
protectedRouter.delete('/users/:userId', AdminAuthController.deleteUser);

// PUT /admin/users/:userId - Update user details with comprehensive validation
protectedRouter.put('/users/:userId', AdminAuthController.updateUser);

// Mount protected routes
router.use('/', protectedRouter);

module.exports = router;
