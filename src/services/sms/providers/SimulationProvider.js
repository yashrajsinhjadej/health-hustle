// Simulation SMS Provider - For development and testing
const BaseSMSProvider = require('./BaseSMSProvider');

class SimulationProvider extends BaseSMSProvider {
    constructor() {
        super('Simulation');
        console.log('📱 Simulation SMS Provider initialized');
        console.log('💡 All SMS will be logged to console instead of being sent');
    }

    async sendSMS(phoneNumber, message) {
        const messageId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('\n' + '='.repeat(60));
        console.log('📱 SIMULATION MODE - SMS NOT ACTUALLY SENT');
        console.log('='.repeat(60));
        console.log(`📞 To: ${phoneNumber}`);
        console.log(`📝 Message: ${message}`);
        console.log(`🆔 Message ID: ${messageId}`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log('='.repeat(60) + '\n');

        return {
            success: true,
            messageId: messageId,
            message: 'SMS sent successfully (simulation mode)',
            phone: phoneNumber,
            provider: 'simulation',
            simulation: true,
            timestamp: new Date().toISOString()
        };
    }

    async sendOTP(phoneNumber, otp) {
        const message = this.getDefaultOTPMessage(otp);
        const result = await this.sendSMS(phoneNumber, message);
        
        // Add OTP to result for easy testing
        return {
            ...result,
            otp: otp // Include OTP in response for development
        };
    }

    isAvailable() {
        return true; // Simulation is always available
    }

    validateConfig() {
        return {
            isValid: true,
            message: 'Simulation provider requires no configuration'
        };
    }

    getConfig() {
        return {
            provider: 'simulation',
            isAvailable: true,
            mode: 'development',
            note: 'SMS messages are logged to console only'
        };
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: 'Simulation provider is always available',
            mode: 'development',
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = SimulationProvider;
