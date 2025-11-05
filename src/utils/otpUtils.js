// OTP Utility Functions
const crypto = require('crypto');
const Logger = require('./logger');

class OTPUtils {
    
    // Generate random 6-digit OTP
    static generateOTP() {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        Logger.info('OTPUtils', ' generateOTP', 'Generated new OTP', { otpLength: otp.length });
        return otp;
    }


    // Validate OTP format
    static isValidOTP(otp) {
        const otpRegex = /^\d{6}$/;
        const isValid = otpRegex.test(otp);
        Logger.info('OTPUtils', 'isValidOTP', 'OTP format validation', { 
            otp: otp ? `${otp.slice(0, 2)}****` : 'null',
            isValid,
            format: 'Expected 6 digits'
        });
        return isValid;
    }

    // Clean and format phone number
    static cleanPhoneNumber(phone) {
        // Convert to string first and handle edge cases
        if (!phone) {
            Logger.warn('OTPUtils', 'cleanPhoneNumber', 'Empty phone number provided');
            return '';
        }
        const phoneStr = String(phone);
        // Remove all non-digit characters except +
        const cleaned = phoneStr.replace(/[^\d+]/g, '');
        Logger.info('OTPUtils', 'cleanPhoneNumber', 'Phone number cleaned', {
            originalLength: phoneStr.length,
            cleanedLength: cleaned.length,
            hasCountryCode: cleaned.startsWith('+')
        });
        return cleaned;
    }

    // Validate phone number format
    static isValidPhoneNumber(phone) {
        const phoneRegex = /^\+?[\d\s-()]{10,15}$/;
        const isValid = phoneRegex.test(phone);
        Logger.info('OTPUtils', 'isValidPhoneNumber', 'Phone number validation', {
            phone: phone ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : 'null',
            isValid,
            length: phone ? phone.length : 0
        });
        return isValid;
    }

    // Simulate sending OTP (replace with actual SMS service)
    static async sendOTP(phone, otp) {
        const operationId = `otp_send_${Date.now()}`;
        Logger.info('OTPUtils', 'sendOTP', 'Starting OTP send operation', {
            operationId,
            phone: phone ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : 'null',
            otp: otp ? `${otp.slice(0, 2)}****` : 'null'
        });
        
        try {
            // TODO: Replace with actual SMS service (Twilio, AWS SNS, etc.)
            Logger.debug('OTPUtils', 'sendOTP', `📱 Simulating OTP send`, { 
                phone: phone ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : 'null',
                otp: otp ? `${otp.slice(0, 2)}****` : 'null'
            });
            
            // Simulate SMS service response
            const result = {
                success: true,
                message: 'OTP sent successfully',
                messageId: `msg_${Date.now()}`,
                otp: otp
            };
            
            Logger.success('OTPUtils', 'sendOTP', 'OTP sent successfully', {
                operationId,
                messageId: result.messageId,
                phone: phone ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : 'null'
            });
            
            return result;
        } catch (error) {
            Logger.error('OTPUtils', 'sendOTP', 'SMS sending failed', {
                operationId,
                error: error.message,
                stack: error.stack,
                phone: phone ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : 'null'
            });
            
            return {
                success: false,
                message: 'Failed to send OTP',
                error: error.message
            };
        }
    }
}

module.exports = OTPUtils;
