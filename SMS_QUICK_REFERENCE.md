# 📱 SMS Provider Quick Reference

## 🚀 Quick Start

### Development (Simulation Mode)
```env
SMS_PROVIDER=simulation
```
✅ No credentials needed  
✅ SMS logged to console  
✅ Perfect for testing  

### Production (MSG91)
```env
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=your_key
MSG91_SENDER_ID=HLTHHS
```

### Production (Twilio)
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
```

---

## 🔧 Setup Commands

```bash
# Interactive setup
./setup-sms.sh

# Install dependency
npm install axios

# Start server
npm run dev
```

---

## 🧪 Test Commands

```bash
# Check provider status
curl http://localhost:3000/debug/sms-provider

# Health check
curl http://localhost:3000/debug/sms-health

# Test SMS
curl -X POST http://localhost:3000/debug/test-sms \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'

# Test OTP flow
curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

---

## 🔄 Switch Provider

```env
# From simulation to MSG91
SMS_PROVIDER=msg91

# From MSG91 to Twilio
SMS_PROVIDER=twilio

# Back to simulation
SMS_PROVIDER=simulation
```

**Then restart server!**

---

## 🗑️ Remove Provider (e.g., Twilio)

```bash
# 1. Switch to another provider
echo "SMS_PROVIDER=msg91" >> .env

# 2. Delete file
rm src/services/sms/providers/TwilioProvider.js

# 3. Remove from factory (optional)
# Edit SMSProviderFactory.js and remove 'twilio' case

# 4. Uninstall
npm uninstall twilio

# 5. Clean .env
# Remove TWILIO_* variables
```

---

## ➕ Add New Provider

```bash
# 1. Create file
# src/services/sms/providers/YourProvider.js

# 2. Extend BaseSMSProvider
class YourProvider extends BaseSMSProvider {
    constructor() {
        super('YourProvider');
    }
    
    async sendSMS(phone, message) { }
    async sendOTP(phone, otp) { }
    isAvailable() { }
    validateConfig() { }
    getConfig() { }
    async healthCheck() { }
}

# 3. Add to factory
# Edit SMSProviderFactory.js

# 4. Use it
echo "SMS_PROVIDER=yourprovider" >> .env
```

---

## 🐛 Troubleshooting

```bash
# Check provider status
curl http://localhost:3000/debug/sms-provider

# Check health
curl http://localhost:3000/debug/sms-health

# Check logs
tail -f your-log-file

# Verify env loaded
node -e "console.log(process.env.SMS_PROVIDER)"

# Test in code
node -e "
const factory = require('./src/services/sms/SMSProviderFactory');
console.log('Provider:', factory.getProviderName());
console.log('Available:', factory.getProvider().isAvailable());
"
```

---

## 📁 File Structure

```
src/services/sms/
├── SMSProviderFactory.js       # Main factory
├── README.md                    # Full docs
└── providers/
    ├── BaseSMSProvider.js      # Base class
    ├── SimulationProvider.js   # Dev mode
    ├── MSG91Provider.js        # India
    └── TwilioProvider.js       # International
```

---

## 🔑 Environment Variables

| Variable | Required | Default | Values |
|----------|----------|---------|--------|
| SMS_PROVIDER | No | simulation | simulation, msg91, twilio |
| MSG91_AUTH_KEY | For MSG91 | - | Your auth key |
| MSG91_SENDER_ID | For MSG91 | HLTHHS | 6 chars |
| MSG91_TEMPLATE_ID | No | - | Template ID |
| TWILIO_ACCOUNT_SID | For Twilio | - | ACxxxxx |
| TWILIO_AUTH_TOKEN | For Twilio | - | Your token |
| TWILIO_PHONE_NUMBER | For Twilio | - | +1234567890 |

---

## 📊 Debug Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /debug/sms-provider | GET | Provider info |
| /debug/sms-health | GET | Health check |
| /debug/test-sms | POST | Test SMS (sim only) |

---

## ✅ Checklist

### Development Setup
- [ ] SMS_PROVIDER=simulation in .env
- [ ] npm run dev
- [ ] Test OTP flow
- [ ] Check console for SMS

### Production Setup
- [ ] Get MSG91 account
- [ ] Set SMS_PROVIDER=msg91
- [ ] Add MSG91_AUTH_KEY
- [ ] Add MSG91_SENDER_ID
- [ ] Test with real number
- [ ] Monitor delivery

### To Remove Twilio
- [ ] Switch to MSG91 or simulation
- [ ] Delete TwilioProvider.js
- [ ] Remove from factory
- [ ] npm uninstall twilio
- [ ] Clean .env files

---

## 📚 Full Documentation

- **Complete Guide**: `src/services/sms/README.md`
- **Migration Guide**: `SMS_MIGRATION_GUIDE.md`
- **Summary**: `SMS_SYSTEM_SUMMARY.md`
- **This Card**: `SMS_QUICK_REFERENCE.md`

---

## 💡 Remember

1. **Always use simulation in dev**
2. **Test provider before deploying**
3. **Never commit .env file**
4. **Monitor SMS in production**
5. **Keep credentials secure**

---

## 🎉 One-Line Setup

```bash
./setup-sms.sh && npm run dev
```

**That's it!** 🚀

---

Print this card and keep it handy! 📋
