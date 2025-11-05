# SMS Provider Migration Guide

## 🎯 Goal
Migrate from direct Twilio dependency to a flexible SMS provider system that supports:
- ✅ MSG91 (Recommended for India)
- ✅ Twilio (Optional, can be removed)
- ✅ Simulation Mode (Development)

## 📦 Installation

### Install axios (required for MSG91)
```bash
npm install axios
```

## 🔧 Configuration

### 1. Update your .env file

Add the SMS_PROVIDER variable at the top:
```env
# Choose your SMS provider
SMS_PROVIDER=simulation
```

### 2. Add MSG91 credentials (for production)
```env
# MSG91 Configuration
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=your_msg91_auth_key_here
MSG91_SENDER_ID=HLTHHS
MSG91_TEMPLATE_ID=your_template_id_here  # Optional but recommended
MSG91_ROUTE=4
MSG91_COUNTRY=91
```

## 🚀 Deployment Steps

### Development Environment
```env
SMS_PROVIDER=simulation
```
No other configuration needed. All SMS will be logged to console.

### Production Environment (MSG91)

1. **Get MSG91 Account**
   - Sign up at https://msg91.com
   - Verify your account
   - Add credits to your account

2. **Get Credentials**
   - Get Auth Key from MSG91 dashboard
   - Create Sender ID (e.g., HLTHHS) - requires approval
   - (Optional) Create OTP template for better delivery

3. **Update Environment Variables**
   ```env
   SMS_PROVIDER=msg91
   MSG91_AUTH_KEY=your_actual_auth_key
   MSG91_SENDER_ID=HLTHHS
   MSG91_TEMPLATE_ID=your_template_id  # If you created one
   ```

4. **Restart Server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   
   # Or restart your deployment (Vercel, etc.)
   ```

## 🧪 Testing

### 1. Check SMS Provider Status
```bash
curl http://localhost:3000/debug/sms-provider
```

Expected response:
```json
{
  "success": true,
  "message": "SMS Provider Information",
  "currentProvider": {
    "name": "Simulation",
    "isAvailable": true,
    "config": {
      "provider": "simulation",
      "mode": "development"
    }
  },
  "health": {
    "status": "healthy",
    "provider": "Simulation"
  }
}
```

### 2. Health Check
```bash
curl http://localhost:3000/debug/sms-health
```

### 3. Test SMS (Simulation Only)
```bash
curl -X POST http://localhost:3000/debug/test-sms \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

### 4. Test OTP Flow

**Send OTP:**
```bash
curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

**Check Console** for OTP (in simulation mode):
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

## 🔄 Switching Providers

### From Simulation to MSG91
```env
# Before
SMS_PROVIDER=simulation

# After
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=your_actual_key
MSG91_SENDER_ID=HLTHHS
```

**No code changes required!** Just update .env and restart.

### From MSG91 to Twilio (if needed)
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
```

## 🗑️ Removing Twilio (Optional)

If you want to completely remove Twilio support:

### 1. Make sure you're using MSG91 or Simulation
```env
SMS_PROVIDER=msg91  # or simulation
```

### 2. Delete Twilio provider file
```bash
rm src/services/sms/providers/TwilioProvider.js
```

### 3. Update SMSProviderFactory.js
Remove the Twilio case from the switch statement:
```javascript
// Remove this block from SMSProviderFactory.js
case 'twilio':
    const TwilioProvider = require('./providers/TwilioProvider');
    this.provider = new TwilioProvider();
    this.providerName = 'Twilio';
    break;
```

### 4. Uninstall Twilio package
```bash
npm uninstall twilio
```

### 5. Remove Twilio env vars from .env.example
Remove these lines:
```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
```

### 6. (Optional) Remove old Twilio service file
```bash
rm src/services/twilioSMSService.js
```

## 📝 Code Changes Summary

### Files Modified
✅ `src/services/otpService.js` - Updated to use SMSProviderFactory
✅ `.env.example` - Added SMS provider configuration

### Files Created
✅ `src/services/sms/SMSProviderFactory.js` - Factory pattern for providers
✅ `src/services/sms/providers/BaseSMSProvider.js` - Base class
✅ `src/services/sms/providers/SimulationProvider.js` - Development mode
✅ `src/services/sms/providers/MSG91Provider.js` - MSG91 integration
✅ `src/services/sms/providers/TwilioProvider.js` - Twilio integration
✅ `src/services/sms/README.md` - Complete documentation
✅ `src/routes/debug/index.js` - Added SMS debug endpoints

### No Changes Required In
✅ Controllers (AuthController, etc.) - Work as-is
✅ Routes - Work as-is
✅ Other services - Work as-is

## 🐛 Troubleshooting

### Provider not initializing
**Check:** Environment variables are set correctly
```bash
# Check current provider
curl http://localhost:3000/debug/sms-provider
```

### SMS not being sent
**Solution:**
1. Verify SMS_PROVIDER is set
2. Check provider credentials
3. Run health check
4. Check console logs

### Wrong provider being used
**Solution:**
1. Check .env file
2. Restart server
3. Verify with debug endpoint

### Axios not installed error
```bash
npm install axios
```

## 📊 Monitoring

### Check Provider Status
```javascript
const SMSProviderFactory = require('./services/sms/SMSProviderFactory');

// Get current provider info
const info = SMSProviderFactory.getProviderInfo();
console.log('Current Provider:', info.name);
console.log('Is Available:', info.isAvailable);
console.log('Configuration:', info.config);

// Run health check
const health = await SMSProviderFactory.healthCheck();
console.log('Health Status:', health.status);
```

### Log All SMS Attempts
The system automatically logs:
- Provider being used
- Phone number
- Success/failure
- Message ID
- Errors (if any)

## 🔐 Security Best Practices

1. **Never commit .env file**
   ```bash
   # .gitignore should have:
   .env
   ```

2. **Use strong credentials**
   - Keep API keys secure
   - Rotate keys regularly
   - Use different keys for dev/prod

3. **Monitor SMS usage**
   - Check provider dashboard
   - Set up usage alerts
   - Monitor for unusual activity

4. **Use simulation in development**
   ```env
   # Development
   SMS_PROVIDER=simulation
   
   # Production
   SMS_PROVIDER=msg91
   ```

## 📈 Production Checklist

- [ ] Install axios: `npm install axios`
- [ ] Set SMS_PROVIDER to msg91 (or twilio)
- [ ] Add MSG91_AUTH_KEY to environment
- [ ] Add MSG91_SENDER_ID to environment
- [ ] (Optional) Add MSG91_TEMPLATE_ID
- [ ] Test with debug endpoint
- [ ] Run health check
- [ ] Test OTP flow with real number
- [ ] Monitor first few SMS deliveries
- [ ] Set up error alerting
- [ ] Document your setup

## 🎉 Benefits of New System

1. **Easy to Switch** - Change provider with 1 env variable
2. **Easy to Remove** - Delete provider file, no code changes
3. **Easy to Test** - Simulation mode for development
4. **Easy to Add** - New providers follow same pattern
5. **Easy to Monitor** - Built-in health checks
6. **Clean Architecture** - Separation of concerns
7. **Type Safety** - Base class enforces interface
8. **Error Handling** - Graceful fallbacks

## 📞 Support

Need help?
1. Check `src/services/sms/README.md` for detailed docs
2. Use debug endpoints to diagnose issues
3. Review console logs
4. Check provider dashboard

## 🚀 Next Steps

1. Install axios
2. Update .env with your provider choice
3. Test with debug endpoints
4. Deploy and monitor
5. (Optional) Remove Twilio if not needed

---

**Happy Messaging! 📱**
