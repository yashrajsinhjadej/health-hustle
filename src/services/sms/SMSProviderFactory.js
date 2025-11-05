// SMS Provider Factory - Centralized SMS service management
// This factory makes it easy to switch between SMS providers via environment variable
const Logger = require('../../utils/logger');

class SMSProviderFactory {
    constructor() {
        this.provider = null;
        this.providerName = null;
    }

    // Initialize the SMS provider based on environment variable
    initialize() {
        const requestId = Logger.generateId('sms-factory');
        
        // Get provider from environment (default to simulation)
        const smsProvider = (process.env.SMS_PROVIDER || 'simulation').toLowerCase();
        
        Logger.info(requestId, 'Initializing SMS Provider', { 
            provider: smsProvider,
            env: process.env.SMS_PROVIDER 
        });

        try {
            switch (smsProvider) {
                case 'msg91':
                    const MSG91Provider = require('./providers/MSG91Provider');
                    this.provider = new MSG91Provider();
                    this.providerName = 'MSG91';
                    break;

                case 'twilio':
                    const TwilioProvider = require('./providers/TwilioProvider');
                    this.provider = new TwilioProvider();
                    this.providerName = 'Twilio';
                    break;

                case 'simulation':
                default:
                    const SimulationProvider = require('./providers/SimulationProvider');
                    this.provider = new SimulationProvider();
                    this.providerName = 'Simulation';
                    break;
            }

            Logger.success(requestId, `SMS Provider initialized: ${this.providerName}`);
            
            // Validate provider configuration
            const validation = this.provider.validateConfig();
            if (!validation.isValid) {
                Logger.warn(requestId, 'Provider configuration issues detected', validation);
            }

            return this.provider;
        } catch (error) {
            Logger.error(requestId, 'Failed to initialize SMS provider', {
                provider: smsProvider,
                error: error.message
            });
            
            // Fallback to simulation
            Logger.warn(requestId, 'Falling back to Simulation Provider');
            const SimulationProvider = require('./providers/SimulationProvider');
            this.provider = new SimulationProvider();
            this.providerName = 'Simulation (Fallback)';
            
            return this.provider;
        }
    }

    // Get the current provider instance
    getProvider() {
        if (!this.provider) {
            this.initialize();
        }
        return this.provider;
    }

    // Get provider name
    getProviderName() {
        return this.providerName || 'Unknown';
    }

    // Get provider info
    getProviderInfo() {
        if (!this.provider) {
            this.initialize();
        }

        return {
            name: this.providerName,
            isAvailable: this.provider.isAvailable(),
            config: this.provider.getConfig(),
            validation: this.provider.validateConfig()
        };
    }

    // Health check for current provider
    async healthCheck() {
        if (!this.provider) {
            this.initialize();
        }

        try {
            const health = await this.provider.healthCheck();
            return {
                provider: this.providerName,
                ...health
            };
        } catch (error) {
            return {
                provider: this.providerName,
                status: 'error',
                message: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new SMSProviderFactory();
