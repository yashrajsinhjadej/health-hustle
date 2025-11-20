// Environment Variable Validation
// Validates that all required environment variables are set before starting the server

const Logger = require('../utils/logger');

class EnvValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    // Required environment variables (app won't start without these)
    static REQUIRED_VARS = [
        'MONGODB_URI',
        'JWT_SECRET',
        'REDIS_URL',
        'JWT_EXPIRES_IN',
        'REDIS_SESSION_TTL'
    ];

    // Recommended environment variables (app will work but may have issues)
    static RECOMMENDED_VARS = [
        'AWS_REGION',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_BUCKET_NAME',
        'SMS_PROVIDER',
        'NODE_ENV'
    ];

    // Validate a single required variable
    validateRequired(varName) {
        if (!process.env[varName]) {
            this.errors.push(`❌ Missing REQUIRED environment variable: ${varName}`);
            return false;
        }
        return true;
    }

    // Validate a single recommended variable
    validateRecommended(varName) {
        if (!process.env[varName]) {
            this.warnings.push(`⚠️  Missing RECOMMENDED environment variable: ${varName}`);
            return false;
        }
        return true;
    }

    // Validate JWT_SECRET strength
    validateJWTSecret() {
        const secret = process.env.JWT_SECRET;
        if (secret && secret.length < 32) {
            this.warnings.push('⚠️  JWT_SECRET is too short. Recommended minimum: 32 characters');
        }
        if (secret && secret.includes('your_super_secret')) {
            this.errors.push('❌ JWT_SECRET appears to be the default example value. Generate a strong secret!');
        }
    }

    // Validate numeric environment variables
    validateNumeric(varName, min = null, max = null) {
        const value = process.env[varName];
        if (value) {
            const parsed = parseInt(value, 10);
            if (isNaN(parsed)) {
                this.errors.push(`❌ ${varName} must be a number, got: ${value}`);
            } else {
                if (min !== null && parsed < min) {
                    this.errors.push(`❌ ${varName} must be at least ${min}, got: ${parsed}`);
                }
                if (max !== null && parsed > max) {
                    this.errors.push(`❌ ${varName} must be at most ${max}, got: ${parsed}`);
                }
            }
        }
    }

    // Validate MongoDB URI format
    validateMongoURI() {
        const uri = process.env.MONGODB_URI;
        if (uri && !uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
            this.errors.push('❌ MONGODB_URI must start with mongodb:// or mongodb+srv://');
        }
    }

    // Validate Redis URL format
    validateRedisURL() {
        const url = process.env.REDIS_URL;
        if (url && !url.startsWith('redis://') && !url.startsWith('rediss://')) {
            this.errors.push('❌ REDIS_URL must start with redis:// or rediss://');
        }
    }

    // Validate NODE_ENV
    validateNodeEnv() {
        const env = process.env.NODE_ENV;
        if (env && !['development', 'production', 'test'].includes(env)) {
            this.warnings.push(`⚠️  NODE_ENV should be 'development', 'production', or 'test', got: ${env}`);
        }
    }

    // Run all validations
    validate() {
        console.log('\n🔍 Validating environment variables...\n');

        // Validate required variables
        EnvValidator.REQUIRED_VARS.forEach(varName => {
            this.validateRequired(varName);
        });

        // Validate recommended variables
        EnvValidator.RECOMMENDED_VARS.forEach(varName => {
            this.validateRecommended(varName);
        });

        // Run specific validations
        this.validateJWTSecret();
        this.validateMongoURI();
        this.validateRedisURL();
        this.validateNodeEnv();

        // Validate numeric values
        this.validateNumeric('PORT', 1, 65535);
        this.validateNumeric('OTP_EXPIRY_MINUTES', 1, 60);
        this.validateNumeric('OTP_MAX_ATTEMPTS', 1, 10);
        this.validateNumeric('REDIS_SESSION_TTL', 60);

        // Display results
        this.displayResults();

        // Throw error if validation failed
        if (this.errors.length > 0) {
            throw new Error('Environment validation failed. Please fix the errors above.');
        }

        return true;
    }

    // Display validation results
    displayResults() {
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ All environment variables validated successfully!\n');
            return;
        }

        // Display errors
        if (this.errors.length > 0) {
            console.error('🚨 VALIDATION ERRORS:\n');
            this.errors.forEach(error => console.error(`   ${error}`));
            console.error('\n');
        }

        // Display warnings
        if (this.warnings.length > 0) {
            console.warn('⚠️  VALIDATION WARNINGS:\n');
            this.warnings.forEach(warning => console.warn(`   ${warning}`));
            console.warn('\n');
        }

        // Show help message
        if (this.errors.length > 0) {
            console.error('💡 Help: Copy .env.example to .env and fill in your values\n');
        }
    }
}

// Export validation function
module.exports = function validateEnvironment() {
    const validator = new EnvValidator();
    return validator.validate();
};
