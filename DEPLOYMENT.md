# Health Hustle - Vercel Deployment Guide

## 🚀 Quick Deploy to Vercel

### Prerequisites
1. Vercel account (free tier available)
2. MongoDB Atlas database
3. (Optional) Twilio account for SMS

### Step 1: Prepare Environment Variables

You'll need to set these environment variables in Vercel:

#### Required Variables:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/health-hustle?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
```

#### Optional Variables (for SMS):
```
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

### Step 2: Deploy to Vercel

#### Option A: Using Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow prompts and set environment variables
```

#### Option B: Using Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Set environment variables in project settings
5. Deploy

### Step 3: Configure Environment Variables

In Vercel Dashboard:
1. Go to your project
2. Settings → Environment Variables
3. Add each variable from Step 1

### Step 4: Test Deployment

Your API will be available at:
```
https://your-project-name.vercel.app/api
```

Test endpoints:
- `GET /api/health` - Health check
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify OTP

## 🔧 Current API Endpoints

### Authentication
- `POST /api/auth/send-otp` - Send OTP to phone
- `POST /api/auth/verify-otp` - Verify OTP and login

### User Management
- `GET /api/user/dashboard` - Get user profile
- `PUT /api/user/dashboard` - Update user profile

### Health Data
- `GET /api/user/health/today` - Get today's health data
- `GET /api/user/health/:date` - Get health data by date
- `PUT /api/user/health/:date` - Update health data
- `PUT /api/user/health/bulk` - Bulk update health data
- `PUT /api/user/health/quick-update` - Quick health update

## 📱 Frontend Integration

### Base URL
```
https://your-project-name.vercel.app/api
```

### Authentication Flow
1. Send OTP: `POST /auth/send-otp`
2. Verify OTP: `POST /auth/verify-otp`
3. Store JWT token from response headers
4. Use JWT for all subsequent API calls

### Example Frontend Code
```javascript
// Send OTP
const sendOTP = async (phone) => {
  const response = await fetch('https://your-project.vercel.app/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  return response.json();
};

// Verify OTP
const verifyOTP = async (phone, otp) => {
  const response = await fetch('https://your-project.vercel.app/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp })
  });
  
  // Get JWT token from headers
  const token = response.headers.get('Authorization');
  localStorage.setItem('token', token);
  
  return response.json();
};

// Authenticated request
const getProfile = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('https://your-project.vercel.app/api/user/dashboard', {
    headers: { 'Authorization': token }
  });
  return response.json();
};
```

## 🐛 Troubleshooting

### Common Issues:
1. **MongoDB Connection Error**: Check MONGODB_URI format
2. **JWT Errors**: Ensure JWT_SECRET is set
3. **CORS Issues**: CORS is already configured for all origins
4. **SMS Not Working**: Check Twilio credentials or use simulation mode

### Health Check
Visit `/api/health` to check if everything is working:
```json
{
  "status": "healthy",
  "message": "Health Hustle API Server is running!",
  "database": { "status": "connected" },
  "twilio": { "status": "healthy" }
}
```

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify environment variables
3. Test with Postman collection
4. Check MongoDB Atlas connection 