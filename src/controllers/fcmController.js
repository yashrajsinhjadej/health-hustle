// controllers/userController.js
const User = require("../models/User");

// Save or update user's FCM token + timezone
const saveFcmToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    const tzHeader = req.headers['timezone']; // frontend sends this

    // 1) Incoming diagnostics
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

    // 2) Live schema inspection (proves what prod actually compiled)
    console.log('[saveFcmToken] Schema paths include timezone?', {
      hasTimezonePath: !!User.schema.path('timezone'),
      timezonePath: User.schema.path('timezone'), // should be an instance of SchemaString
      allPathsCount: Object.keys(User.schema.paths).length,
    });
    console.log('[saveFcmToken] Known paths sample:', Object.keys(User.schema.paths).slice(0, 20));

    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      console.error('[saveFcmToken] Missing user on request context');
      return res.status(401).json({ success: false, message: "Unauthorized: missing user" });
    }

    // 3) Use atomic update to eliminate doc hydration and pre-save hook effects
    console.log('[saveFcmToken] Performing atomic updateOne...');
    const updateResult = await User.updateOne(
      { _id: userId },
      {
        $set: {
          timezone: tzHeader, // must match your schema's root path
          'fcmToken.token': token,
          'fcmToken.platform': platform || 'android',
          'fcmToken.lastUsedAt': new Date(),
        }
      }
    );
    console.log('[saveFcmToken] updateOne result:', updateResult);

    // 4) Verify via lean read (bypasses Mongoose transforms/virtuals)
    const freshLean = await User.findById(userId).lean();
    console.log('[saveFcmToken] Lean verify:', {
      timezone: freshLean?.timezone,
      fcmToken: freshLean?.fcmToken,
    });

    // 5) Also verify via hydrated read (to catch select/transform hiding)
    const freshDoc = await User.findById(userId);
    console.log('[saveFcmToken] Hydrated verify:', {
      timezone: freshDoc?.timezone,
      fcmToken: freshDoc?.fcmToken,
    });

    return res.json({
      success: true,
      message: "FCM token and timezone saved successfully",
      data: {
        timezone: freshLean?.timezone ?? freshDoc?.timezone ?? null,
        platform: freshLean?.fcmToken?.platform ?? freshDoc?.fcmToken?.platform ?? null,
        token: freshLean?.fcmToken?.token ?? freshDoc?.fcmToken?.token ?? null,
      },
    });
  } catch (error) {
    console.error("[saveFcmToken] Error saving FCM token:", {
      name: error?.name,
      message: error?.message,
      errors: error?.errors,
      stack: error?.stack?.split('\n').slice(0, 5),
    });
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = { saveFcmToken };
