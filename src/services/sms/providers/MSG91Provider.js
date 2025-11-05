// MSG91 SMS Provider - Production SMS service for India
const BaseSMSProvider = require('./BaseSMSProvider');
const axios = require('axios');

class MSG91Provider extends BaseSMSProvider {
    constructor() {
        super('MSG91');
        
        // MSG91 Configuration
        this.authKey = process.env.MSG91_AUTH_KEY;
        this.senderId = process.env.MSG91_SENDER_ID || 'HLTHHS'; // 6 char sender ID
        this.templateId = process.env.MSG91_TEMPLATE_ID; // For OTP template
        this.route = process.env.MSG91_ROUTE || '4'; // Route 4 is transactional
        this.country = process.env.MSG91_COUNTRY || '91'; // Default India
        
        // MSG91 API endpoints
        this.baseURL = 'https://api.msg91.com/api';
        this.otpBaseURL = 'https://control.msg91.com/api';
        
        console.log(this.isAvailable() 
            ? '✅ MSG91 SMS Provider initialized'
            : '⚠️ MSG91 credentials not configured - check environment variables'
        );
    }

    async sendSMS(phoneNumber, message) {
        const messageId = `msg91_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            if (!this.isAvailable()) {
                throw new Error('MSG91 credentials not configured');
            }

            // Format phone number (remove +91 if present, MSG91 handles it)
            const cleanPhone = phoneNumber.replace(/^\+91/, '').replace(/^\+/, '');

            // MSG91 Send SMS endpoint
            const url = `${this.baseURL}/sendhttp.php`;
            
            const params = {
                authkey: this.authKey,
                mobiles: cleanPhone,
                message: message,
                sender: this.senderId,
                route: this.route,
                country: this.country
            };

            console.log(`📱 [${messageId}] Sending SMS via MSG91 to ${cleanPhone}`);
            
            const response = await axios.get(url, { params });
            
            console.log(`📱 [${messageId}] MSG91 Response:`, response.data);

            // MSG91 returns: {"message":"SMS sent successfully.","type":"success"}
            if (response.data.type === 'success' || response.data.message.includes('success')) {
                console.log(`✅ [${messageId}] SMS sent successfully via MSG91`);
                
                return {
                    success: true,
                    messageId: messageId,
                    message: 'SMS sent successfully via MSG91',
                    phone: phoneNumber,
                    provider: 'msg91',
                    providerResponse: response.data,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error(response.data.message || 'Unknown MSG91 error');
            }

        } catch (error) {
            console.error(`❌ [${messageId}] MSG91 SMS error:`, error.message);
            
            return {
                success: false,
                messageId: messageId,
                message: 'Failed to send SMS via MSG91',
                phone: phoneNumber,
                provider: 'msg91',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sendOTP(phoneNumber, otp) {
        const messageId = `msg91_otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            if (!this.isAvailable()) {
                throw new Error('MSG91 credentials not configured');
            }

            // If template ID is provided, use MSG91's OTP API (recommended)
            if (this.templateId) {
                return await this.sendOTPViaTemplate(phoneNumber, otp, messageId);
            }
            
            // Otherwise, send OTP as regular SMS
            const message = this.getDefaultOTPMessage(otp);
            return await this.sendSMS(phoneNumber, message);

        } catch (error) {
            console.error(`❌ [${messageId}] MSG91 OTP error:`, error.message);
            
            return {
                success: false,
                messageId: messageId,
                message: 'Failed to send OTP via MSG91',
                phone: phoneNumber,
                provider: 'msg91',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Send OTP using MSG91's OTP template API
    async sendOTPViaTemplate(phoneNumber, otp, messageId) {
        try {
            // Format phone number
            const cleanPhone = phoneNumber.replace(/^\+91/, '').replace(/^\+/, '');

            // MSG91 OTP Send endpoint
            const url = `${this.otpBaseURL}/v5/otp`;
            
            const payload = {
                template_id: this.templateId,
                mobile: cleanPhone,
                authkey: this.authKey,
                otp: otp
            };

            console.log(`📱 [${messageId}] Sending OTP via MSG91 template to ${cleanPhone}`);
            
            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`📱 [${messageId}] MSG91 OTP Response:`, response.data);

            if (response.data.type === 'success') {
                console.log(`✅ [${messageId}] OTP sent successfully via MSG91 template`);
                
                return {
                    success: true,
                    messageId: messageId,
                    message: 'OTP sent successfully via MSG91',
                    phone: phoneNumber,
                    provider: 'msg91',
                    method: 'template',
                    providerResponse: response.data,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error(response.data.message || 'Unknown MSG91 error');
            }

        } catch (error) {
            console.error(`❌ [${messageId}] MSG91 OTP template error:`, error.message);
            
            // Fallback to regular SMS
            console.log(`🔄 [${messageId}] Falling back to regular SMS`);
            const message = this.getDefaultOTPMessage(otp);
            return await this.sendSMS(phoneNumber, message);
        }
    }

    isAvailable() {
        return !!(this.authKey && this.senderId);
    }

    validateConfig() {
        const missing = [];
        
        if (!this.authKey) missing.push('MSG91_AUTH_KEY');
        if (!this.senderId) missing.push('MSG91_SENDER_ID');
        
        return {
            isValid: missing.length === 0,
            missing: missing,
            message: missing.length === 0 
                ? 'MSG91 is properly configured'
                : `Missing configuration: ${missing.join(', ')}`,
            optional: {
                templateId: !!this.templateId,
                note: this.templateId 
                    ? 'Using OTP template (recommended)' 
                    : 'Template not configured - using regular SMS'
            }
        };
    }

    getConfig() {
        return {
            provider: 'msg91',
            isAvailable: this.isAvailable(),
            authKey: this.authKey ? 'configured' : 'missing',
            senderId: this.senderId || 'missing',
            templateId: this.templateId ? 'configured' : 'not configured',
            route: this.route,
            country: this.country
        };
    }

    async healthCheck() {
        try {
            if (!this.isAvailable()) {
                return {
                    status: 'unavailable',
                    message: 'MSG91 credentials not configured',
                    setup: 'Add MSG91_AUTH_KEY and MSG91_SENDER_ID to .env file',
                    validation: this.validateConfig()
                };
            }

            // Test MSG91 connection by checking balance
            const url = `${this.baseURL}/balance.php`;
            const params = {
                authkey: this.authKey,
                type: this.route
            };

            const response = await axios.get(url, { params });
            
            return {
                status: 'healthy',
                message: 'MSG91 SMS Service is working',
                balance: response.data,
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

module.exports = MSG91Provider;
