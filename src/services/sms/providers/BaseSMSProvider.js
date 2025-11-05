// Base SMS Provider - Abstract class defining the interface for all SMS providers
// All SMS providers must extend this class and implement the required methods

class BaseSMSProvider {
    constructor(providerName) {
        if (this.constructor === BaseSMSProvider) {
            throw new Error('BaseSMSProvider is an abstract class and cannot be instantiated directly');
        }
        this.providerName = providerName;
    }

    /**
     * Send SMS to a phone number
     * @param {string} phoneNumber - The recipient phone number
     * @param {string} message - The message to send
     * @returns {Promise<Object>} Result object with success status and details
     */
    async sendSMS(phoneNumber, message) {
        throw new Error('sendSMS() must be implemented by subclass');
    }

    /**
     * Send OTP SMS with provider-specific formatting
     * @param {string} phoneNumber - The recipient phone number
     * @param {string} otp - The OTP code to send
     * @returns {Promise<Object>} Result object with success status and details
     */
    async sendOTP(phoneNumber, otp) {
        throw new Error('sendOTP() must be implemented by subclass');
    }

    /**
     * Format phone number according to provider requirements
     * @param {string} phoneNumber - Raw phone number
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        // Default implementation - add +91 for 10-digit Indian numbers
        if (phoneNumber.length === 10 && !phoneNumber.startsWith('+')) {
            return `+91${phoneNumber}`;
        }
        if (!phoneNumber.startsWith('+')) {
            return `+${phoneNumber}`;
        }
        return phoneNumber;
    }

    /**
     * Check if provider is available and configured
     * @returns {boolean} True if provider is ready to use
     */
    isAvailable() {
        throw new Error('isAvailable() must be implemented by subclass');
    }

    /**
     * Validate provider configuration
     * @returns {Object} Validation result with isValid flag and missing fields
     */
    validateConfig() {
        throw new Error('validateConfig() must be implemented by subclass');
    }

    /**
     * Get provider configuration status (without exposing secrets)
     * @returns {Object} Configuration status
     */
    getConfig() {
        throw new Error('getConfig() must be implemented by subclass');
    }

    /**
     * Health check for the provider
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        throw new Error('healthCheck() must be implemented by subclass');
    }

    /**
     * Get provider name
     * @returns {string} Provider name
     */
    getName() {
        return this.providerName;
    }

    /**
     * Generate greeting based on time of day
     * @returns {string} Greeting message
     */
    getTimeBasedGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning!';
        if (hour < 17) return 'Good afternoon!';
        return 'Good evening!';
    }

    /**
     * Generate default OTP message
     * @param {string} otp - The OTP code
     * @returns {string} Formatted OTP message
     */
    getDefaultOTPMessage(otp) {
        const greeting = this.getTimeBasedGreeting();
        const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
        return `${greeting} Your Health Hustle verification code is: ${otp}. Valid for ${expiryMinutes} minutes.`;
    }
}

module.exports = BaseSMSProvider;
