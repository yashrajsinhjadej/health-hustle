// OTP Utility Functions
const crypto = require('crypto');

class OTPUtils {
    
    // Generate random 6-digit OTP
    static generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }


    // Validate OTP format
    static isValidOTP(otp) {
        const otpRegex = /^\d{6}$/;
        return otpRegex.test(otp);
    }

    // Clean and format phone number
    static cleanPhoneNumber(phone) {
        // Convert to string first and handle edge cases
        if (!phone) return '';
        const phoneStr = String(phone);
        // Remove all non-digit characters except +
        return phoneStr.replace(/[^\d+]/g, '');
    }

    // Validate phone number format
    static isValidPhoneNumber(phone) {
        const phoneRegex = /^\+?[\d\s-()]{10,15}$/;
        return phoneRegex.test(phone);
    }

    // Simulate sending OTP (replace with actual SMS service)
    static async sendOTP(phone, otp) {
        try {
            // TODO: Replace with actual SMS service (Twilio, AWS SNS, etc.)
            console.log(`📱 OTP sent to ${phone}: ${otp}`);
            
            // Simulate SMS service response
            return {
                success: true,
                message: 'OTP sent successfully',
                messageId: `msg_${Date.now()}`,
                otp: otp
            };
        } catch (error) {
            console.error('SMS sending failed:', error);
            return {
                success: false,
                message: 'Failed to send OTP',
                error: error.message
            };
        }
    }
}

module.exports = OTPUtils;
