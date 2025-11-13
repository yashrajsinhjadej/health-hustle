// controllers/userController.js
const User = require("../models/User");

const saveFcmToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    const timezone = req.headers['timezone'];
    const userId = req.user?._id || req.user?.id;

    if (!token) return res.status(400).json({ success: false, message: "FCM token is required" });
    if (!timezone) return res.status(400).json({ success: false, message: "Timezone is required (e.g., Asia/Kolkata)" });
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: missing user" });

    // Atomic update to ensure persistence regardless of doc hydration
    const result = await User.updateOne(
      { _id: userId },
      {
        $set: {
          timezone,
          'fcmToken.token': token,
          'fcmToken.platform': platform || 'android',
          'fcmToken.lastUsedAt': new Date(),
        }
      }
    );

    // Minimal verification read
    const fresh = await User.findById(userId).lean();

    // Optional: tiny log for modified vs matched in non-prod
    if (process.env.NODE_ENV !== 'production') {
      console.log('[saveFcmToken] updateOne:', { matched: result.matchedCount, modified: result.modifiedCount });
    }

    return res.json({
      success: true,
      message: "FCM token and timezone saved successfully",
      data: {
        timezone: fresh?.timezone ?? null,
        platform: fresh?.fcmToken?.platform ?? null,
        token: fresh?.fcmToken?.token ?? null,
      },
    });
  } catch (error) {
    console.error("[saveFcmToken] Error:", error?.message);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = { saveFcmToken };
