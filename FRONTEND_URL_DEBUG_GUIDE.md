# Frontend URL Debugging Guide

## 🔍 Problem: Password Reset Links Use Localhost in Production

### Symptoms:
- Password reset emails contain `http://localhost:3001/admin/reset-password?token=...`
- Links don't work when clicked from email
- Issue only happens on Vercel deployment

## ✅ Solution Checklist

### Step 1: Check Environment Variable in Vercel
1. Go to: https://vercel.com/dashboard
2. Select your **backend** project (health-hustle)
3. Go to: **Settings** → **Environment Variables**
4. Look for: `FRONTEND_URL`
5. **If missing or wrong**: Add/Update it

### Step 2: Set Correct Frontend URL

**Development:**
```
FRONTEND_URL=http://localhost:3001
```

**Production (Vercel):**
```
FRONTEND_URL=https://your-admin-frontend.vercel.app
```

**Important:** 
- Use your actual admin frontend deployment URL
- Must start with `https://` for production
- Don't include trailing slash

### Step 3: Apply to All Environments

In Vercel environment variables settings:
- ✅ Check **Production**
- ✅ Check **Preview** 
- ✅ Check **Development**

### Step 4: Redeploy Backend

After adding/updating the variable:
```bash
# Option 1: Automatic (push to git)
git add .
git commit -m "Add FRONTEND_URL logging"
git push

# Option 2: Manual (Vercel dashboard)
Go to Deployments → Click "..." → Redeploy
```

## 🧪 Debug Endpoints (After Deployment)

### 1. Check Startup Logs
Visit your Vercel deployment logs to see:
```
🔍 ===== ENVIRONMENT VARIABLES DEBUG =====
🔍 - FRONTEND_URL exists: true/false
🔍 - FRONTEND_URL value: "..."
```

### 2. Check Environment Variables Endpoint
```bash
curl https://your-backend.vercel.app/env-debug
```

Look for the `frontendUrl` section:
```json
{
  "frontendUrl": {
    "exists": true,
    "value": "https://your-admin-frontend.vercel.app",
    "isLocalhost": false,
    "isHttps": true
  }
}
```

### 3. Check Frontend URL Debug Endpoint
```bash
curl https://your-backend.vercel.app/frontend-url-debug
```

This shows exactly what URL will be used for reset links:
```json
{
  "frontendUrl": {
    "configured": true,
    "value": "https://your-admin-frontend.vercel.app",
    "finalUrl": "https://your-admin-frontend.vercel.app"
  },
  "sampleResetLink": {
    "generatedLink": "https://your-admin-frontend.vercel.app/admin/reset-password?token=abc123..."
  }
}
```

### 4. Check Forgot Password Request Logs
After triggering forgot password, check Vercel logs for:
```
🔑 ===== RESET LINK GENERATION DEBUG =====
🔑 - process.env.FRONTEND_URL exists: true
🔑 - process.env.FRONTEND_URL value: "https://..."
🔑 - Using default fallback: false
🔑 - Final reset link: https://...
🔑 - Reset link starts with https: true
🔑 - Reset link starts with localhost: false
```

## 📊 Expected Log Output (Correct Setup)

### On Vercel (Production):
```
🔍 - FRONTEND_URL exists: true
🔍 - FRONTEND_URL value: "https://admin-panel.vercel.app"
🔑 - Selected frontendUrl: "https://admin-panel.vercel.app"
🔑 - Using default fallback: false
🔑 - Final reset link: https://admin-panel.vercel.app/admin/reset-password?token=...
🔑 - Reset link starts with https: true
🔑 - Reset link starts with localhost: false
```

### On Vercel (Wrong Setup - Using Localhost):
```
🔍 - FRONTEND_URL exists: false
🔍 - FRONTEND_URL value: "undefined"
🔑 - Selected frontendUrl: "http://localhost:3001"
🔑 - Using default fallback: true
🔑 - Final reset link: http://localhost:3001/admin/reset-password?token=...
🔑 - Reset link starts with https: false
🔑 - Reset link starts with localhost: true
```

## 🎯 Common Issues & Solutions

### Issue 1: Variable Not Found in Vercel
**Symptom:** Logs show `FRONTEND_URL exists: false`

**Solution:**
- Add `FRONTEND_URL` in Vercel dashboard environment variables
- Redeploy the backend

### Issue 2: Wrong URL Format
**Symptom:** Logs show URL but it's wrong

**Solution:**
- Update the `FRONTEND_URL` value in Vercel
- Ensure it starts with `https://` (not `http://`)
- Don't include trailing slash

### Issue 3: Environment Not Selected
**Symptom:** Works in development but not production

**Solution:**
- In Vercel, make sure `FRONTEND_URL` is checked for **Production** environment
- Redeploy production

### Issue 4: Cache Issues
**Symptom:** Still showing old URL after update

**Solution:**
```bash
# Force clear deployment cache
vercel --prod --force
```

## 📝 Deployment Checklist

Before deploying:
- [ ] `FRONTEND_URL` added to Vercel environment variables
- [ ] Value is your actual frontend URL (https://...)
- [ ] All environments checked (Production, Preview, Development)
- [ ] Backend redeployed after adding variable
- [ ] Tested `/env-debug` endpoint shows correct URL
- [ ] Tested `/frontend-url-debug` endpoint shows correct URL
- [ ] Triggered forgot password and checked email link
- [ ] Clicked link and verified it works

## 🚀 Quick Test Commands

After deployment, run these tests:

```bash
# 1. Check if FRONTEND_URL is configured
curl https://your-backend.vercel.app/frontend-url-debug | jq .frontendUrl

# 2. Check all environment variables
curl https://your-backend.vercel.app/env-debug | jq .

# 3. Trigger password reset (replace with real admin email)
curl -X POST https://your-backend.vercel.app/api/admin/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com"}'

# 4. Check Vercel logs immediately after
# Look for "RESET LINK GENERATION DEBUG" section
```

## 💡 Pro Tips

1. **Always check logs first**: Vercel logs show exactly what URL is being used
2. **Use the debug endpoints**: They're specifically designed to troubleshoot this issue
3. **Don't include trailing slash**: `https://app.com` not `https://app.com/`
4. **Verify in email**: Check the actual email received to confirm URL
5. **Test in production**: Don't assume it works - always test after deployment

## 🆘 If Still Not Working

Check these logs in this exact order:

1. **Startup logs** - Does it load `FRONTEND_URL`?
2. **`/frontend-url-debug`** - What URL will be used?
3. **Forgot password logs** - What URL was actually generated?
4. **Email content** - What URL is in the actual email?
5. **Vercel environment variables** - Is `FRONTEND_URL` actually set?

The logs will tell you exactly which step is failing!
