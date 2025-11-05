// Twilio SMS Provider - Alternative SMS service (can be removed if not needed)
const BaseSMSProvider = require('./BaseSMSProvider');

class TwilioProvider extends BaseSMSProvider {
    constructor() {
        super('Twilio');
        
        // Twilio Configuration
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        
        // Initialize Twilio client if credentials are available
        if (this.isAvailable()) {
            const twilio = require('twilio');
            this.client = twilio(this.accountSid, this.authToken);
            console.log('✅ Twilio SMS Provider initialized');
        } else {
            console.log('⚠️ Twilio credentials not configured - check environment variables');
        }
    }

    async sendSMS(phoneNumber, message) {
        const messageId = `twilio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            if (!this.isAvailable()) {
                throw new Error('Twilio credentials not configured');
            }

            // Format phone number with country code
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            console.log(`📱 [${messageId}] Sending SMS via Twilio to ${formattedPhone}`);
            
            // Send SMS via Twilio
            const result = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: formattedPhone
            });
            
            console.log(`✅ [${messageId}] SMS sent successfully via Twilio`);
            console.log(`📱 [${messageId}] Twilio message SID: ${result.sid}`);
            console.log(`📱 [${messageId}] Twilio status: ${result.status}`);
            
            return {
                success: true,
                messageId: result.sid,
                message: 'SMS sent successfully via Twilio',
                phone: phoneNumber,
                provider: 'twilio',
                status: result.status,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ [${messageId}] Twilio SMS error:`, error.message);
            
            return {
                success: false,
                messageId: messageId,
                message: 'Failed to send SMS via Twilio',
                phone: phoneNumber,
                provider: 'twilio',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sendOTP(phoneNumber, otp) {
        const message = this.getDefaultOTPMessage(otp);
        return await this.sendSMS(phoneNumber, message);
    }

    formatPhoneNumber(phoneNumber) {
        // Twilio requires E.164 format: +[country code][number]
        if (phoneNumber.length === 10 && !phoneNumber.startsWith('+')) {
            return `+91${phoneNumber}`;
        }
        if (!phoneNumber.startsWith('+')) {
            return `+${phoneNumber}`;
        }
        return phoneNumber;
    }

    isAvailable() {
        return !!(this.accountSid && this.authToken && this.fromNumber);
    }

    validateConfig() {
        const missing = [];
        
        if (!this.accountSid) missing.push('TWILIO_ACCOUNT_SID');
        if (!this.authToken) missing.push('TWILIO_AUTH_TOKEN');
        if (!this.fromNumber) missing.push('TWILIO_PHONE_NUMBER');
        
        return {
            isValid: missing.length === 0,
            missing: missing,
            message: missing.length === 0 
                ? 'Twilio is properly configured'
                : `Missing configuration: ${missing.join(', ')}`
        };
    }

    getConfig() {
        return {
            provider: 'twilio',
            isAvailable: this.isAvailable(),
            accountSid: this.accountSid ? 'configured' : 'missing',
            authToken: this.authToken ? 'configured' : 'missing',
            fromNumber: this.fromNumber || 'missing'
        };
    }

    async healthCheck() {
        try {
            if (!this.isAvailable()) {
                return {
                    status: 'unavailable',
                    message: 'Twilio credentials not configured',
                    setup: 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to .env',
                    validation: this.validateConfig()
                };
            }

            // Test Twilio connection by getting account info
            const account = await this.client.api.accounts(this.accountSid).fetch();
            
            return {
                status: 'healthy',
                message: 'Twilio SMS Service is working',
                accountSid: this.accountSid,
                fromNumber: this.fromNumber,
                accountStatus: account.status,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                status: 'error',
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = TwilioProvider;
