const User = require("../models/User");

// Save or update user's FCM token + timezone
const saveFcmToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    const timezone = req.headers['timezone'];
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    if (!timezone) {
      return res.status(400).json({
        success: false,
        message: "Timezone is required (e.g., Asia/Kolkata)",
      });
    }

    // Update user FCM + timezone
    req.user.fcmToken = {
      token,
      platform: platform || "android",
      lastUsedAt: new Date(),
    };
    req.user.timezone = timezone;

    await req.user.save();

    return res.json({
      success: true,
      message: "FCM token and timezone saved successfully",
      data: {
        timezone: req.user.timezone,
        platform: req.user.fcmToken.platform,
        token: req.user.fcmToken.token,
      },
    });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = { saveFcmToken };
