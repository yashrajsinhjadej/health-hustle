# SMS Provider System Documentation

## Overview

The SMS Provider System is a flexible, modular architecture for sending SMS messages in the Health Hustle application. It allows you to easily switch between different SMS providers or use simulation mode for development.

## Architecture

```
src/services/sms/
├── SMSProviderFactory.js          # Factory to manage SMS providers
└── providers/
    ├── BaseSMSProvider.js         # Abstract base class for all providers
    ├── SimulationProvider.js      # Development/testing provider
    ├── MSG91Provider.js           # MSG91 SMS service (India)
    └── TwilioProvider.js          # Twilio SMS service (International)
```

## Features

- ✅ **Easy Provider Switching** - Change SMS provider with one environment variable
- ✅ **Simulation Mode** - Test without sending real SMS
- ✅ **Provider Abstraction** - All providers follow the same interface
- ✅ **Easy to Add/Remove** - Add new providers or remove old ones without breaking code
- ✅ **Health Checks** - Monitor provider status and configuration
- ✅ **Error Handling** - Graceful fallback to simulation mode on errors

## Quick Start

### 1. Choose Your Provider

Set the `SMS_PROVIDER` environment variable in your `.env` file:

```env
# Choose one: simulation, msg91, or twilio
SMS_PROVIDER=simulation
```

### 2. Configure Your Chosen Provider

#### Simulation Mode (Development)
No configuration needed! Perfect for development and testing.

```env
SMS_PROVIDER=simulation
```

#### MSG91 (Recommended for India)
```env
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=your_auth_key_here
MSG91_SENDER_ID=HLTHHS
MSG91_TEMPLATE_ID=your_template_id  # Optional but recommended
MSG91_ROUTE=4
MSG91_COUNTRY=91
```

#### Twilio (International)
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### 3. Use in Your Code

The system is already integrated with the OTP service. SMS sending is automatic when you call:

```javascript
const OTPService = require('./services/otpService');

// Send OTP - automatically uses configured provider
const result = await OTPService.sendOTP(phone);
```

## Provider Details

### Simulation Provider

**Use Case**: Development, testing, debugging

**Features**:
- Logs SMS to console instead of sending
- Always returns success
- No external API calls
- Zero cost
- Includes OTP in response for easy testing

**Configuration**: None required

### MSG91 Provider

**Use Case**: Production (India)

**Features**:
- Reliable SMS delivery in India
- Support for OTP templates (faster delivery)
- Cost-effective for Indian numbers
- Balance checking
- Transactional SMS route

**Required Config**:
- `MSG91_AUTH_KEY` - Your MSG91 authentication key
- `MSG91_SENDER_ID` - 6-character sender ID (e.g., HLTHHS)

**Optional Config**:
- `MSG91_TEMPLATE_ID` - Template ID for faster OTP delivery
- `MSG91_ROUTE` - Default: 4 (Transactional)
- `MSG91_COUNTRY` - Default: 91 (India)

**Setup Steps**:
1. Sign up at [https://msg91.com](https://msg91.com)
2. Get your Auth Key from dashboard
3. Create a Sender ID (requires approval)
4. (Optional) Create an OTP template for better delivery
5. Add credentials to `.env` file

### Twilio Provider

**Use Case**: International SMS, backup provider

**Features**:
- Global SMS delivery
- Reliable international service
- E.164 phone number formatting
- Account health monitoring

**Required Config**:
- `TWILIO_ACCOUNT_SID` - Your Twilio account SID
- `TWILIO_AUTH_TOKEN` - Your Twilio auth token
- `TWILIO_PHONE_NUMBER` - Your Twilio phone number

**Setup Steps**:
1. Sign up at [https://www.twilio.com](https://www.twilio.com)
2. Get Account SID and Auth Token from console
3. Purchase a phone number
4. Add credentials to `.env` file

## How to Switch Providers

### From Simulation to MSG91 (Going to Production)
```env
# Before (Development)
SMS_PROVIDER=simulation

# After (Production)
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=your_actual_auth_key
MSG91_SENDER_ID=HLTHHS
```

### From MSG91 to Twilio
```env
# Before
SMS_PROVIDER=msg91

# After
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
```

### Back to Simulation for Testing
```env
SMS_PROVIDER=simulation
```

**No code changes required!** Just update the environment variable and restart your server.

## How to Remove a Provider

Want to remove Twilio? It's easy:

### Step 1: Make sure you're not using it
```env
SMS_PROVIDER=msg91  # or simulation
```

### Step 2: Delete the provider file
```bash
rm src/services/sms/providers/TwilioProvider.js
```

### Step 3: Remove from factory (optional)
Edit `SMSProviderFactory.js` and remove the Twilio case:

```javascript
// Remove this block:
case 'twilio':
    const TwilioProvider = require('./providers/TwilioProvider');
    this.provider = new TwilioProvider();
    this.providerName = 'Twilio';
    break;
```

### Step 4: Clean up environment variables
Remove Twilio variables from `.env` and `.env.example`:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_PHONE_NUMBER

### Step 5: Uninstall dependencies (optional)
```bash
npm uninstall twilio
```

That's it! The provider is completely removed.

## How to Add a New Provider

### Step 1: Create Provider Class

Create `src/services/sms/providers/YourProviderName.js`:

```javascript
const BaseSMSProvider = require('./BaseSMSProvider');

class YourProvider extends BaseSMSProvider {
    constructor() {
        super('YourProviderName');
        // Initialize your provider
    }

    async sendSMS(phoneNumber, message) {
        // Implement SMS sending logic
        return {
            success: true,
            messageId: 'your_message_id',
            message: 'SMS sent successfully',
            phone: phoneNumber,
            provider: 'yourprovider'
        };
    }

    async sendOTP(phoneNumber, otp) {
        // Implement OTP sending logic
        const message = this.getDefaultOTPMessage(otp);
        return await this.sendSMS(phoneNumber, message);
    }

    isAvailable() {
        // Check if provider is configured
        return !!this.yourApiKey;
    }

    validateConfig() {
        // Validate configuration
        return {
            isValid: true,
            message: 'Provider configured'
        };
    }

    getConfig() {
        // Return config status
        return {
            provider: 'yourprovider',
            isAvailable: this.isAvailable()
        };
    }

    async healthCheck() {
        // Check provider health
        return {
            status: 'healthy',
            message: 'Provider is working'
        };
    }
}

module.exports = YourProvider;
```

### Step 2: Add to Factory

Edit `SMSProviderFactory.js`:

```javascript
case 'yourprovider':
    const YourProvider = require('./providers/YourProvider');
    this.provider = new YourProvider();
    this.providerName = 'YourProvider';
    break;
```

### Step 3: Add Environment Variables

Update `.env.example`:

```env
# YOUR PROVIDER CONFIGURATION
YOUR_PROVIDER_API_KEY=your_api_key
YOUR_PROVIDER_SENDER_ID=your_sender
```

### Step 4: Use It

```env
SMS_PROVIDER=yourprovider
YOUR_PROVIDER_API_KEY=actual_key
```

## Health Check Endpoint

Check your SMS provider status:

```javascript
const SMSProviderFactory = require('./services/sms/SMSProviderFactory');

// Get provider info
const info = SMSProviderFactory.getProviderInfo();
console.log(info);

// Check health
const health = await SMSProviderFactory.healthCheck();
console.log(health);
```

## Testing

### Test in Simulation Mode
```env
SMS_PROVIDER=simulation
```

All SMS will be logged to console:
```
============================================================
📱 SIMULATION MODE - SMS NOT ACTUALLY SENT
============================================================
📞 To: 9876543210
📝 Message: Good morning! Your Health Hustle verification code is: 123456. Valid for 5 minutes.
🆔 Message ID: sim_1699999999999_abc123
⏰ Time: 11/5/2025, 10:30:00 AM
============================================================
```

### Test Provider Configuration
```javascript
const SMSProviderFactory = require('./services/sms/SMSProviderFactory');

// Initialize provider
const provider = SMSProviderFactory.getProvider();

// Check if configured correctly
const validation = provider.validateConfig();
console.log(validation);
// Output: { isValid: true/false, missing: [...], message: '...' }
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMS_PROVIDER` | No | `simulation` | Provider to use: simulation, msg91, twilio |
| `MSG91_AUTH_KEY` | Yes (for MSG91) | - | MSG91 authentication key |
| `MSG91_SENDER_ID` | Yes (for MSG91) | `HLTHHS` | 6-char sender ID |
| `MSG91_TEMPLATE_ID` | No | - | OTP template ID (recommended) |
| `MSG91_ROUTE` | No | `4` | SMS route (4 = transactional) |
| `MSG91_COUNTRY` | No | `91` | Country code (91 = India) |
| `TWILIO_ACCOUNT_SID` | Yes (for Twilio) | - | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes (for Twilio) | - | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes (for Twilio) | - | Twilio phone number |

## Troubleshooting

### SMS not being sent
1. Check `SMS_PROVIDER` is set correctly
2. Verify provider credentials in `.env`
3. Check provider validation: `provider.validateConfig()`
4. Run health check: `SMSProviderFactory.healthCheck()`

### Wrong provider being used
1. Check `.env` file is loaded
2. Verify `SMS_PROVIDER` value (case-insensitive)
3. Restart your server after changing `.env`

### Provider falls back to simulation
1. Missing or invalid credentials
2. Provider initialization failed
3. Check console logs for error messages

## Best Practices

1. **Use Simulation in Development**
   ```env
   SMS_PROVIDER=simulation
   ```

2. **Use MSG91 in Production (India)**
   ```env
   SMS_PROVIDER=msg91
   ```

3. **Never commit real credentials**
   - Keep `.env` in `.gitignore`
   - Use `.env.example` for documentation

4. **Test provider health before going live**
   ```javascript
   const health = await SMSProviderFactory.healthCheck();
   if (health.status !== 'healthy') {
       console.error('SMS provider not healthy!', health);
   }
   ```

5. **Monitor SMS delivery**
   - Check provider dashboard
   - Log all SMS attempts
   - Set up alerts for failures

## Migration Guide

### Current System → New System

The new system is backward compatible but uses a cleaner architecture:

**Old Way**:
```javascript
const TwilioSMSService = require('./twilioSMSService');
await TwilioSMSService.sendOTP(phone, otp);
```

**New Way** (Already implemented in OTPService):
```javascript
const SMSProviderFactory = require('./sms/SMSProviderFactory');
const provider = SMSProviderFactory.getProvider();
await provider.sendOTP(phone, otp);
```

No changes needed in your controllers - the OTPService already uses the new system!

## Support

For issues or questions:
1. Check provider documentation
2. Verify environment variables
3. Test with simulation mode first
4. Check provider health status
5. Review console logs for errors

## License

Part of Health Hustle API - Internal Documentation
