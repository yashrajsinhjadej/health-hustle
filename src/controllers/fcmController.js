// controllers/userController.js
const User = require("../models/User");

// Save or update user's FCM token + timezone
const saveFcmToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    const tzHeader = req.headers['timezone']; // frontend-provided header (lowercased in Node)

    // Diagnostic: log incoming request essentials
    console.log('[saveFcmToken] Incoming:', {
      method: req.method,
      path: req.originalUrl || req.url,
      userId: req.user?._id || req.user?.id,
      hasUserDoc: !!req.user && typeof req.user.save === 'function',
      tzHeader,
      ua: req.headers['user-agent'],
    });

    if (!token) {
      console.warn('[saveFcmToken] Missing token');
      return res.status(400).json({ success: false, message: "FCM token is required" });
    }

    if (!tzHeader) {
      console.warn('[saveFcmToken] Missing timezone header');
      return res.status(400).json({ success: false, message: "Timezone is required (e.g., Asia/Kolkata)" });
    }

    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      console.error('[saveFcmToken] Missing user on request context');
      return res.status(401).json({ success: false, message: "Unauthorized: missing user" });
    }

    // If req.user is not a hydrated Mongoose document, use atomic update
    if (typeof req.user?.save !== 'function') {
      console.log('[saveFcmToken] req.user is not a doc; using updateOne fallback');
      const updateResult = await User.updateOne(
        { _id: userId },
        {
          $set: {
            timezone: tzHeader,
            'fcmToken.token': token,
            'fcmToken.platform': platform || 'android',
            'fcmToken.lastUsedAt': new Date(),
          }
        }
      );
      console.log('[saveFcmToken] updateOne result:', updateResult);

      const fresh = await User.findById(userId);
      console.log('[saveFcmToken] Fresh read after update:', {
        timezone: fresh?.timezone,
        fcmToken: fresh?.fcmToken,
      });

      return res.json({
        success: true,
        message: "FCM token and timezone saved successfully",
        data: {
          timezone: fresh?.timezone ?? null,
          platform: fresh?.fcmToken?.platform ?? null,
          token: fresh?.fcmToken?.token ?? null,
        },
      });
    }

    // Normal path: mutate hydrated document and save
    console.log('[saveFcmToken] Mutating hydrated doc and saving...');
    req.user.fcmToken = {
      token,
      platform: platform || "android",
      lastUsedAt: new Date(),
    };
    req.user.timezone = tzHeader;

    console.log('[saveFcmToken] Pre-save values:', {
      timezone: req.user.timezone,
      fcmToken: req.user.fcmToken,
    });

    const saved = await req.user.save();

    console.log('[saveFcmToken] Post-save persisted values:', {
      timezone: saved.timezone,
      fcmToken: saved.fcmToken,
    });

    // Read back from DB to ensure persistence (helps catch accidental in-memory-only mutations)
    const verify = await User.findById(userId);
    console.log('[saveFcmToken] DB verify read:', {
      timezone: verify?.timezone,
      fcmToken: verify?.fcmToken,
    });

    return res.json({
      success: true,
      message: "FCM token and timezone saved successfully",
      data: {
        timezone: verify?.timezone ?? saved.timezone,
        platform: verify?.fcmToken?.platform ?? saved.fcmToken?.platform ?? null,
        token: verify?.fcmToken?.token ?? saved.fcmToken?.token ?? null,
      },
    });
  } catch (error) {
    // Surface validation errors clearly (e.g., regex mismatch)
    console.error("[saveFcmToken] Error saving FCM token:", {
      name: error?.name,
      message: error?.message,
      errors: error?.errors,
    });
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = { saveFcmToken };
