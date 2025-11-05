# API Error Codes Reference

This document lists all error codes returned by the authentication system for programmatic error handling on the frontend.

## Authentication Error Codes

### Send OTP Errors (`POST /api/auth/send-otp`)

| Error Code | Message | Error Details | HTTP Status | Description |
|-----------|---------|---------------|-------------|-------------|
| `INVALID_PHONE` | Invalid phone number format | Phone number must be exactly 10 digits | 400 | Phone number validation failed |
| `OTP_CREATION_FAILED` | Failed to create OTP | (varies) | 400 | Database error creating OTP record |
| `SMS_SEND_FAILED` | Failed to send OTP | SMS service is temporarily unavailable. Please try again. | 400 | SMS provider failed to send message |
| `INTERNAL_ERROR` | Failed to send OTP | An unexpected error occurred. Please try again. | 400 | Unexpected server error |

### Verify OTP Errors (`POST /api/auth/verify-otp`)

| Error Code | Message | Error Details | HTTP Status | Description |
|-----------|---------|---------------|-------------|-------------|
| `INVALID_PHONE` | Invalid phone number format | Phone number must be exactly 10 digits | 400 | Phone number validation failed |
| `INVALID_OTP_FORMAT` | Invalid OTP format | OTP must be exactly 6 digits | 400 | OTP format validation failed |
| `INVALID_OTP` | Invalid OTP | X attempt(s) remaining | 400 | OTP doesn't match (with remaining attempts) |
| `MAX_ATTEMPTS_EXCEEDED` | Maximum verification attempts exceeded | Please request a new OTP | 400 | User exceeded 3 verification attempts |
| `OTP_NOT_FOUND` | Invalid or expired OTP | Please request a new OTP | 400 | No valid OTP record found (expired or never existed) |
| `INTERNAL_ERROR` | Failed to verify OTP | An unexpected error occurred. Please try again. | 400 | Unexpected server error |

## Error Response Format

All error responses follow this structure:

```json
{
  "message": "User-friendly error message",
  "error": "Detailed error explanation",
  "code": "ERROR_CODE"
}
```

### Example Error Responses

#### Invalid Phone Number
```json
{
  "message": "Invalid phone number format",
  "error": "Phone number must be exactly 10 digits",
  "code": "INVALID_PHONE"
}
```

#### Invalid OTP with Remaining Attempts
```json
{
  "message": "Invalid OTP",
  "error": "2 attempt(s) remaining",
  "code": "INVALID_OTP"
}
```

#### Max Attempts Exceeded
```json
{
  "message": "Maximum verification attempts exceeded",
  "error": "Please request a new OTP",
  "code": "MAX_ATTEMPTS_EXCEEDED"
}
```

#### SMS Service Failure
```json
{
  "message": "Failed to send OTP",
  "error": "SMS service is temporarily unavailable. Please try again.",
  "code": "SMS_SEND_FAILED"
}
```

## Frontend Integration Guide

### Handling Error Codes

```javascript
// Example: Send OTP with error handling
async function sendOTP(phone) {
  try {
    const response = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Handle specific error codes
      switch (data.code) {
        case 'INVALID_PHONE':
          showError('Please enter a valid 10-digit phone number');
          break;
        case 'SMS_SEND_FAILED':
          showError('Unable to send SMS. Please try again later.');
          break;
        case 'INTERNAL_ERROR':
          showError('Something went wrong. Please try again.');
          break;
        default:
          showError(data.message);
      }
      return;
    }
    
    // Success
    showSuccess('OTP sent successfully!');
  } catch (error) {
    showError('Network error. Please check your connection.');
  }
}

// Example: Verify OTP with error handling
async function verifyOTP(phone, otp) {
  try {
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Handle specific error codes
      switch (data.code) {
        case 'INVALID_PHONE':
          showError('Invalid phone number format');
          break;
        case 'INVALID_OTP_FORMAT':
          showError('OTP must be 6 digits');
          break;
        case 'INVALID_OTP':
          showError(`Wrong OTP. ${data.error}`); // Shows "2 attempt(s) remaining"
          break;
        case 'MAX_ATTEMPTS_EXCEEDED':
          showError('Too many failed attempts. Please request a new OTP.');
          disableOTPInput();
          showResendButton();
          break;
        case 'OTP_NOT_FOUND':
          showError('OTP expired. Please request a new one.');
          showResendButton();
          break;
        case 'INTERNAL_ERROR':
          showError('Something went wrong. Please try again.');
          break;
        default:
          showError(data.message);
      }
      return;
    }
    
    // Success - store token and redirect
    localStorage.setItem('token', data.data.token);
    redirectToHome();
  } catch (error) {
    showError('Network error. Please check your connection.');
  }
}
```

## Rate Limiting

Rate limiting responses use a different format and don't include error codes:

```json
{
  "message": "Too many requests. Please try again in X seconds."
}
```

Frontend should handle 429 status code and display appropriate cooldown message.

## Success Response Format

Success responses follow this structure:

```json
{
  "message": "Success message",
  "data": {
    // Response data
  }
}
```

### Send OTP Success (Development/Testing)
```json
{
  "message": "OTP sent successfully",
  "data": {
    "messageId": "msg-12345",
    "otp": "123456"  // Only in non-production environments
  }
}
```

### Send OTP Success (Production)
```json
{
  "message": "OTP sent successfully",
  "data": {
    "messageId": "msg-12345"
  }
}
```

### Verify OTP Success
```json
{
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1...",
    "user": {
      "id": "user-id",
      "name": "User Name",
      "phone": "1234567890",
      "profileCompleted": true
    }
  }
}
```

## Notes

- All error codes are strings in UPPER_SNAKE_CASE format
- Error codes are optional in responses but recommended for all error scenarios
- Frontend should always have a fallback for unknown error codes
- Display `message` field to users, use `code` field for conditional logic
- The `error` field may contain additional context (like remaining attempts)
