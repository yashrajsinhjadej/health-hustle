# ResponseHandler Usage Guide

## Overview
The ResponseHandler utility provides standardized API responses across the Health Hustle application.

## Basic Usage

### Import
```javascript
const ResponseHandler = require('../utils/ResponseHandler');
```

## Success Responses

### Simple Success
```javascript
// Basic success with data
return ResponseHandler.success(res, "User profile retrieved successfully", {
    user: {
        id: user._id,
        name: user.name,
        phone: user.phone
    }
});

// Success without data
return ResponseHandler.success(res, "Operation completed successfully");

// Created response (201)
return ResponseHandler.created(res, "User created successfully", {
    user: newUser
});
```

### Success with Meta Information
```javascript
return ResponseHandler.successWithMeta(res, "OTP sent successfully", {
    expiresIn: "5 minutes",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
}, {
    cooldownSeconds: 25,
    requestId: req.requestId
});
```

### Success with Pagination
```javascript
return ResponseHandler.successWithPagination(res, "Health records retrieved", {
    healthRecords: records
}, {
    currentPage: 1,
    totalPages: 10,
    hasNext: true,
    hasPrev: false
});
```

## Error Responses

### Basic Errors
```javascript
// Generic error
return ResponseHandler.error(res, "Operation failed", "Invalid phone number format");

// Validation error
return ResponseHandler.validationError(res, "Validation failed", "Request validation failed", {
    phone: "Phone number must be 10 digits",
    otp: "OTP must be 6 digits"
});

// Rate limiting
return ResponseHandler.rateLimitError(res, 25); // 25 seconds wait
```

### Specific Error Types
```javascript
// Authentication errors
return ResponseHandler.unauthorized(res, "Invalid token");
return ResponseHandler.forbidden(res, "Insufficient permissions");

// Resource errors
return ResponseHandler.notFound(res, "User not found");
return ResponseHandler.conflict(res, "Phone number already exists");

// Server errors
return ResponseHandler.serverError(res, "Database connection failed");
```

### Automatic Error Handling
```javascript
// Handle express-validator errors
const errors = validationResult(req);
if (!errors.isEmpty()) {
    return ResponseHandler.handleValidationErrors(res, errors);
}

// Handle Mongoose errors
try {
    await user.save();
} catch (error) {
    return ResponseHandler.handleMongooseError(res, error);
}

// Async wrapper (handles all errors automatically)
const createUser = ResponseHandler.asyncHandler(async (req, res) => {
    const user = await User.create(req.body);
    return ResponseHandler.created(res, "User created successfully", { user });
});
```

## Response Formats

### Success Response Format
```json
{
    "message": "Operation completed successfully",
    "data": {
        "user": {
            "id": "123",
            "name": "John Doe"
        }
    }
}
```

### Success with Meta Format
```json
{
    "message": "OTP sent successfully",
    "data": {
        "expiresIn": "5 minutes"
    },
    "meta": {
        "cooldownSeconds": 25,
        "requestId": "req_123456"
    }
}
```

### Error Response Format
```json
{
    "message": "Validation failed",
    "error": "Request validation failed",
    "details": {
        "phone": "Phone number must be 10 digits",
        "otp": "OTP must be 6 digits"
    }
}
```

### Rate Limit Error Format
```json
{
    "message": "Too many requests",
    "error": "Please wait before trying again",
    "retryAfter": {
        "seconds": 25,
        "message": "Please wait 25 seconds before trying again"
    }
}
```

## Migration Examples

### Before (Old Format)
```javascript
// Old inconsistent format
res.json({
    success: true,
    message: "OTP sent successfully",
    expiresIn: "5 minutes",
    otp: result.otp
});

res.status(400).json({
    success: false,
    error: result.message,
    waitTime: result.waitTime
});
```

### After (New Format)
```javascript
// New standardized format
return ResponseHandler.successWithMeta(res, "OTP sent successfully", {
    expiresIn: "5 minutes"
}, {
    cooldownSeconds: 25
});

return ResponseHandler.rateLimitError(res, waitTime);
```

## Status Codes Used

- **200** - OK (success)
- **201** - Created (resource created)
- **202** - Accepted (async operation)
- **400** - Bad Request (validation/input errors)
- **401** - Unauthorized (authentication required)
- **403** - Forbidden (insufficient permissions)
- **404** - Not Found (resource not found)
- **409** - Conflict (duplicate/business logic conflict)
- **429** - Too Many Requests (rate limiting)
- **500** - Internal Server Error (unexpected errors)

## Best Practices

1. **Always use ResponseHandler** - Don't create raw JSON responses
2. **Choose appropriate status codes** - Use the right HTTP status for each scenario
3. **Consistent messaging** - Use clear, user-friendly messages
4. **Include relevant data** - Provide necessary information in the data object
5. **Handle errors gracefully** - Use specific error types for better debugging
6. **Use async wrapper** - Wrap async functions to handle unexpected errors

## Examples by Controller

### AuthController
```javascript
// Send OTP
return ResponseHandler.successWithMeta(res, "OTP sent successfully", {
    expiresIn: "5 minutes"
}, {
    cooldownSeconds: parseInt(process.env.OTP_COOLDOWN_SECONDS) || 25
});

// Verify OTP
return ResponseHandler.success(res, "Login successful", {
    user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        profileCompleted: user.profileCompleted
    }
}, 200);

// Rate limit error
return ResponseHandler.rateLimitError(res, remainingSeconds);
```

### UserController
```javascript
// Get profile
return ResponseHandler.success(res, "Profile retrieved successfully", {
    user: userProfile
});

// Update profile
return ResponseHandler.success(res, "Profile updated successfully", {
    user: updatedUser
});

// Profile not found
return ResponseHandler.notFound(res, "User profile not found");
```

### HealthController
```javascript
// Update health data
return ResponseHandler.success(res, "Health data updated successfully", {
    healthData: savedData,
    date: today
});

// Get health data
return ResponseHandler.success(res, "Health data retrieved successfully", {
    healthData: dailyHealth,
    goals: userGoals
});
```
