# Health Hustle - Authentication Approaches

## Overview
This document explains two different authentication approaches for implementing single-user login and logout functionality in the Health Hustle backend.

---

## APPROACH 1: SIMPLE LASTLOGINAT METHOD (Recommended)

### Concept
- Add `lastLoginAt` field to User model
- Compare JWT issued time with user's last login time
- No additional database tables needed
- Simple and efficient

### Implementation Details

#### 1. User Model Changes
```javascript
// Add to src/models/User.js
const userSchema = new mongoose.Schema({
    // ... existing fields ...
    
    lastLoginAt: {
        type: Date,
        default: Date.now
    }
    
    // ... rest of schema ...
});
```

#### 2. Login Process (verifyOTP)
```javascript
// In src/controllers/AuthController.js - verifyOTP method
async verifyOTP(req, res) {
    // ... existing OTP verification logic ...
    
    // After successful OTP verification:
    
    // Update lastLoginAt to current time (this invalidates all previous tokens)
    user.lastLoginAt = new Date();
    await user.save();
    
    // Generate new JWT token
    const token = this.generateToken(user._id);
    
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
}
```

#### 3. Authentication Middleware Enhancement
```javascript
// In src/middleware/auth.js - authenticateToken function
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-otp');

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token or user not found'
            });
        }

        // NEW: Check if token was issued before user's last login
        const tokenIssuedAt = new Date(decoded.iat * 1000); // JWT iat is in seconds
        
        if (user.lastLoginAt > tokenIssuedAt) {
            return res.status(401).json({
                success: false,
                error: 'Session expired due to login from another device',
                action: 'redirect_to_login'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            error: 'Invalid or expired token',
            action: 'redirect_to_login'
        });
    }
};
```

#### 4. Simple Logout Implementation
```javascript
// Add to src/controllers/AuthController.js
async logout(req, res) {
    try {
        const user = req.user;
        
        // Update lastLoginAt to current time (invalidates current token)
        user.lastLoginAt = new Date();
        await user.save();
        
        res.json({
            success: true,
            message: 'Logged out successfully',
            action: 'redirect_to_login'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}
```

#### 5. Route Addition
```javascript
// Add to src/routes/authRoutes.js
const { authenticateToken } = require('../middleware/auth');

// POST /auth/logout - Logout current user
router.post('/logout', authenticateToken, AuthController.logout.bind(AuthController));
```

### Flow Example - Approach 1

**Step 1: User logs in on iPhone**
- User enters OTP → verifyOTP called
- user.lastLoginAt = "2025-08-05T10:00:00Z"
- JWT token created with iat = "2025-08-05T10:00:00Z"
- iPhone stores token and works normally

**Step 2: User logs in on Android**
- User enters OTP → verifyOTP called
- user.lastLoginAt = "2025-08-05T14:00:00Z" (updated!)
- New JWT token created with iat = "2025-08-05T14:00:00Z"
- Android stores new token and works

**Step 3: iPhone tries to make API call**
- iPhone sends old token (iat = "2025-08-05T10:00:00Z")
- Middleware compares: 10:00 AM < 2:00 PM → Token is old
- Returns: "Session expired due to login from another device"
- iPhone gets logged out automatically

**Step 4: User clicks logout on Android**
- logout() called → user.lastLoginAt = "2025-08-05T15:00:00Z"
- Android's token becomes invalid on next API call
- User gets redirected to login

### Pros - Approach 1
- ✅ Very simple implementation
- ✅ No additional database tables
- ✅ Fast - no extra database queries
- ✅ Automatic cleanup (no token management needed)
- ✅ Single login enforcement works perfectly

### Cons - Approach 1
- ❌ Logout effect is not immediate (happens on next API call)
- ❌ No detailed session tracking
- ❌ Cannot provide "logged out from iPhone" messages

---

## APPROACH 2: TOKEN BLACKLIST METHOD

### Concept
- Create TokenBlacklist model to store invalidated tokens
- Immediately blacklist tokens on logout
- Check blacklist on every API call
- More immediate logout experience

### Implementation Details

#### 1. TokenBlacklist Model
```javascript
// Create src/models/TokenBlacklist.js
const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema({
    tokenHash: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // MongoDB TTL - auto delete expired tokens
    },
    reason: {
        type: String,
        enum: ['logout', 'new_device_login'],
        default: 'logout'
    }
}, {
    timestamps: true
});

// Compound index for efficient queries
tokenBlacklistSchema.index({ tokenHash: 1, userId: 1 });

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
```

#### 2. User Model Changes
```javascript
// Add to src/models/User.js (same as Approach 1)
lastLoginAt: {
    type: Date,
    default: Date.now
}
```

#### 3. Enhanced Login Process
```javascript
// In src/controllers/AuthController.js - verifyOTP method
const TokenBlacklist = require('../models/TokenBlacklist');
const crypto = require('crypto');

async verifyOTP(req, res) {
    // ... existing OTP verification logic ...
    
    // After successful OTP verification:
    
    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();
    
    // Generate new JWT token
    const token = this.generateToken(user._id);
    
    // Optional: Blacklist all previous tokens for this user
    // (This ensures immediate logout from other devices)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await TokenBlacklist.create({
        userId: user._id,
        tokenHash: 'ALL_PREVIOUS', // Special marker
        expiresAt: new Date(decoded.exp * 1000),
        reason: 'new_device_login'
    });
    
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
}
```

#### 4. Enhanced Authentication Middleware
```javascript
// In src/middleware/auth.js
const TokenBlacklist = require('../models/TokenBlacklist');
const crypto = require('crypto');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        // Create hash of token for blacklist check
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        // Check if this specific token is blacklisted
        const isBlacklisted = await TokenBlacklist.findOne({
            $or: [
                { tokenHash: tokenHash },
                { tokenHash: 'ALL_PREVIOUS', userId: decoded.userId, 
                  createdAt: { $gt: new Date(decoded.iat * 1000) } }
            ]
        });
        
        if (isBlacklisted) {
            return res.status(401).json({
                success: false,
                error: 'Token has been logged out',
                action: 'redirect_to_login'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-otp');

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token or user not found'
            });
        }

        // Also check lastLoginAt (double security)
        const tokenIssuedAt = new Date(decoded.iat * 1000);
        if (user.lastLoginAt > tokenIssuedAt) {
            return res.status(401).json({
                success: false,
                error: 'Session expired due to login from another device',
                action: 'redirect_to_login'
            });
        }

        req.user = user;
        req.token = token; // Store token for logout
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            error: 'Invalid or expired token',
            action: 'redirect_to_login'
        });
    }
};
```

#### 5. Immediate Logout Implementation
```javascript
// Add to src/controllers/AuthController.js
const TokenBlacklist = require('../models/TokenBlacklist');
const crypto = require('crypto');

async logout(req, res) {
    try {
        const user = req.user;
        const token = req.token;
        
        // Create hash of current token
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        // Get token expiry
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Add current token to blacklist
        await TokenBlacklist.create({
            tokenHash: tokenHash,
            userId: user._id,
            expiresAt: new Date(decoded.exp * 1000),
            reason: 'logout'
        });
        
        // Also update lastLoginAt for double security
        user.lastLoginAt = new Date();
        await user.save();
        
        res.json({
            success: true,
            message: 'Logged out successfully',
            action: 'redirect_to_login'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}
```

### Flow Example - Approach 2

**Step 1: User logs in on iPhone**
- JWT token A created and stored
- No blacklist entries yet

**Step 2: User logs in on Android**
- JWT token B created
- TokenBlacklist entry created marking all previous tokens invalid
- iPhone's token A becomes immediately invalid

**Step 3: iPhone tries to make API call**
- Middleware checks blacklist → Token A found in blacklist
- Immediate error: "Token has been logged out"
- iPhone gets logged out instantly

**Step 4: User clicks logout on Android**
- Token B hash added to blacklist immediately
- Next API call from Android → Token found in blacklist → Immediate logout

### Pros - Approach 2
- ✅ Immediate logout effect
- ✅ More detailed security tracking
- ✅ Can provide better user messages
- ✅ Double security (blacklist + lastLoginAt)

### Cons - Approach 2
- ❌ More complex implementation
- ❌ Additional database table and queries
- ❌ Performance impact (blacklist check on every API call)
- ❌ Requires token cleanup/maintenance

---

## COMPARISON SUMMARY

| Feature | Approach 1 (lastLoginAt) | Approach 2 (Blacklist) |
|---------|-------------------------|------------------------|
| **Complexity** | ✅ Simple | ❌ Complex |
| **Performance** | ✅ Fast | ❌ Slower |
| **Database Load** | ✅ Minimal | ❌ Higher |
| **Logout Speed** | ❌ On next API call | ✅ Immediate |
| **Security** | ✅ Good | ✅ Better |
| **Maintenance** | ✅ No cleanup needed | ❌ Needs cleanup |
| **User Experience** | ❌ Slight delay | ✅ Instant feedback |

---

## RECOMMENDATION

**For Health Hustle, I recommend APPROACH 1 (lastLoginAt method)** because:

1. **Simplicity**: Easier to implement and maintain
2. **Performance**: No additional database overhead
3. **Reliability**: Fewer moving parts, less chance of bugs
4. **Sufficient**: Achieves the core requirement (single login) effectively

The slight delay in logout effect is acceptable for most users and use cases.

---

## IMPLEMENTATION PRIORITY

If you choose Approach 1:
1. Add `lastLoginAt` field to User model
2. Update `verifyOTP` method
3. Enhance `authenticateToken` middleware
4. Add logout endpoint
5. Update auth routes

Total implementation time: ~2-3 hours

If you choose Approach 2:
1. All steps from Approach 1
2. Create TokenBlacklist model
3. Enhance authentication middleware further
4. Add blacklist cleanup job (recommended)
5. Handle edge cases

Total implementation time: ~6-8 hours

---

## TESTING SCENARIOS

### Test Case 1: Single Device Login
1. Login on Device A → Should work
2. Make API calls from Device A → Should work
3. Logout from Device A → Should invalidate session
4. Make API calls from Device A → Should fail

### Test Case 2: Multiple Device Login (Single Session)
1. Login on Device A → Should work
2. Login on Device B → Should work
3. Make API calls from Device A → Should fail (logged out)
4. Make API calls from Device B → Should work

### Test Case 3: Logout Flow
1. Login on device → Should work
2. Click logout → Should return success
3. Make API call → Should fail with redirect action
4. Frontend should redirect to login screen

---

This document provides complete implementation details for both approaches. Choose based on your priority: simplicity vs immediate logout experience.
