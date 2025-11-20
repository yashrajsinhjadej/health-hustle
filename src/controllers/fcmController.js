// controllers/fcmTokenController.js
const User = require('../models/User');
const moment = require('moment-timezone');

const saveFcmToken = async (req, res) => {
  try {
    const { token, platform } = req.body;

    // Raw timezone from frontend
    const rawTimezone = req.headers['timezone'];

    // Normalize timezone -> ALWAYS lowercase
    const normalizedTimezone = rawTimezone?.trim().toLowerCase();

    const userId = req.user?._id || req.user?.id;

    // ---------------------- VALIDATION ----------------------
    if (!token) {
      return res.status(400).json({ success: false, message: "FCM token is required" });
    }

    if (!rawTimezone) {
      return res.status(400).json({ success: false, message: "Timezone is required (e.g., Asia/Kolkata)" });
    }

    // Validate timezone exists in IANA DB
    if (!moment.tz.zone(normalizedTimezone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid timezone: ${rawTimezone}. Use a valid IANA timezone like Asia/Kolkata`
      });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: missing user" });
    }

    // ---------------------- ATOMIC UPDATE ----------------------
    // Simply save the token and timezone, no job creation here
    const result = await User.updateOne(
      { _id: userId },
      {
        $set: {
          timezone: normalizedTimezone,  // ALWAYS save normalized tz
          'fcmToken.token': token,
          'fcmToken.platform': platform || 'android',
          'fcmToken.lastUsedAt': new Date(),
        }
      }
    );

    // Verify update
    const updatedUser = await User.findById(userId).select('timezone fcmToken').lean();

    if (process.env.NODE_ENV !== 'production') {
      console.log('[saveFcmToken] Update result:', {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        verifiedTimezone: updatedUser?.timezone,
        verifiedToken: updatedUser?.fcmToken?.token ? 'present' : 'missing'
      });
    }

    console.log('[saveFcmToken] ✅ Token and timezone saved', {
      userId,
      timezone: normalizedTimezone,
      platform: platform || 'android'
    });

    // ---------------------- RESPONSE ----------------------
    return res.json({
      success: true,
      message: "FCM token and timezone saved successfully",
      data: {
        timezone: updatedUser?.timezone ?? null,
        platform: updatedUser?.fcmToken?.platform ?? null,
        tokenSaved: !!updatedUser?.fcmToken?.token,
      },
    });

  } catch (error) {
    console.error("[saveFcmToken] Error:", error?.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { saveFcmToken };