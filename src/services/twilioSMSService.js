// Twilio SMS Service for Health Hustle - Production Ready
const twilio = require('twilio');

class TwilioSMSService {
    
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        
        // Initialize Twilio client if credentials are available
        if (this.accountSid && this.authToken) {
            this.client = twilio(this.accountSid, this.authToken);
            this.isAvailable = true;
            console.log('✅ Twilio SMS Service initialized');
        } else {
            this.isAvailable = false;
            console.log('⚠️ Twilio credentials not found, using simulation mode');
        }
    }
    
    // Send SMS via Twilio
    async sendSMS(phoneNumber, message) {
        const smsId = `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`📱 [${smsId}] TwilioSMSService.sendSMS START`);
        console.log(`📱 [${smsId}] Phone: ${phoneNumber}, Message length: ${message.length}`);
        console.log(`📱 [${smsId}] Twilio available: ${this.isAvailable}`);
        console.log(`📱 [${smsId}] From number: ${this.fromNumber}`);
        
        try {
            if (!this.isAvailable) {
                console.log(`📱 [${smsId}] Twilio not available, using simulation`);
                return this.simulateSMS(phoneNumber, message);
            }
            
            // Format phone number with country code
            let formattedPhone = phoneNumber;
            console.log(`📱 [${smsId}] Original phone: ${phoneNumber}`);
            
            // If it's a 10-digit Indian number, add +91
            if (phoneNumber.length === 10 && !phoneNumber.startsWith('+')) {
                formattedPhone = `+91${phoneNumber}`;
                console.log(`📱 [${smsId}] Formatted as Indian number: ${formattedPhone}`);
            } else if (!phoneNumber.startsWith('+')) {
                // For other numbers, just add +
                formattedPhone = `+${phoneNumber}`;
                console.log(`📱 [${smsId}] Added country code: ${formattedPhone}`);
            } else {
                console.log(`📱 [${smsId}] Phone already formatted: ${formattedPhone}`);
            }
            
            // Send SMS via Twilio
            console.log(`📱 [${smsId}] Sending SMS via Twilio...`);
            const result = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: formattedPhone
            });
            
            console.log(`📱 [${smsId}] ✅ SMS sent successfully to ${phoneNumber}`);
            console.log(`📱 [${smsId}] Twilio message ID: ${result.sid}`);
            console.log(`📱 [${smsId}] Twilio status: ${result.status}`);
            
            return {
                success: true,
                messageId: result.sid,
                message: 'SMS sent successfully via Twilio',
                phone: phoneNumber,
                status: result.status
            };
            
        } catch (error) {
            console.error('Twilio SMS error:', error);
            
            // If Twilio fails, fall back to simulation
            console.log('🔄 Falling back to simulation mode');
            return this.simulateSMS(phoneNumber, message);
        }
    }
    
    // Send OTP specifically with health-focused message
    async sendOTP(phoneNumber, otp) {
        // Get current time for personalized message
        const hour = new Date().getHours();
        let greeting = '';
        
        if (hour < 12) greeting = 'Good morning!';
        else if (hour < 17) greeting = 'Good afternoon!';
        else greeting = 'Good evening!';
        
        // Customize your message here
        const message = `${greeting} Your Health Hustle verification code is: ${otp}. Valid for 5 minutes.`;
        return await this.sendSMS(phoneNumber, message);
    }
    
    // Simulate SMS sending (fallback)
    simulateSMS(phoneNumber, message) {
        console.log(`📱 [SIMULATION] SMS to ${phoneNumber}: ${message}`);
        console.log(`💡 To enable real SMS, add Twilio credentials to .env file`);
        
        return {
            success: true,
            messageId: `sim_${Date.now()}`,
            message: 'SMS sent (simulation mode)',
            phone: phoneNumber,
            simulation: true
        };
    }
    
    // Health check for Twilio
    async healthCheck() {
        try {
            if (!this.isAvailable) {
                return {
                    status: 'unavailable',
                    message: 'Twilio credentials not configured',
                    setup: 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to .env'
                };
            }
            
            // Test Twilio connection by getting account info
            const account = await this.client.api.accounts(this.accountSid).fetch();
            
            return {
                status: 'healthy',
                message: 'Twilio SMS Service is working',
                accountSid: this.accountSid,
                fromNumber: this.fromNumber,
                accountStatus: account.status
            };
        } catch (error) {
            return {
                status: 'error',
                message: error.message
            };
        }
    }
    
    // Get Twilio configuration info
    getConfig() {
        return {
            isAvailable: this.isAvailable,
            accountSid: this.accountSid ? 'configured' : 'missing',
            authToken: this.authToken ? 'configured' : 'missing',
            fromNumber: this.fromNumber || 'missing'
        };
    }
}

module.exports = new TwilioSMSService(); 