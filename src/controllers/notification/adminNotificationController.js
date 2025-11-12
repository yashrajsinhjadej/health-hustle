// File: controllers/notifications/sendToAllUsers.js
const User = require("../../models/User");
const FCMService = require("../../services/FCMService");

/**
 * Send push notification to all users with FCM tokens
 */
async function sendNotificationToAllUsers(req, res) {
  try {
    const { title, body, data, imageUrl, android, apns, webpush } = req.body;

    // Validate required fields
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required fields",
      });
    }

    console.log(`📢 Sending notification to all users: "${title}"`);

    // Fetch all users with valid FCM tokens
    const users = await User.find(
      { 
        "fcmToken.token": { $exists: true, $ne: null, $ne: "" }
      },
      "fcmToken.token"
    ).lean();

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users with FCM tokens found in database",
      });
    }

    // Extract tokens and filter out invalid ones
    const tokens = users
      .map(u => u.fcmToken?.token)
      .filter(token => token && typeof token === "string" && token.length > 0);

    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid FCM tokens found",
      });
    }

    console.log(`📱 Found ${tokens.length} valid FCM tokens`);

    // Build notification payload
    const payload = {
      notification: {
        title,
        body,
        ...(imageUrl && { imageUrl }),
      },
      data: data || {},
      ...(android && { android }),
      ...(apns && { apns }),
      ...(webpush && { webpush }),
    };

    // Send notifications
    const result = await FCMService.sendToMultipleTokens(tokens, payload);

    console.log(
      `✅ Notification delivery complete:\n` +
      `   Title: "${title}"\n` +
      `   Total Tokens: ${result.totalTokens}\n` +
      `   Successful: ${result.successCount}\n` +
      `   Failed: ${result.failureCount}`
    );

    // Prepare response
    const response = {
      success: true,
      message: `Notification sent to ${result.successCount} out of ${result.totalTokens} users`,
      stats: {
        totalTokens: result.totalTokens,
        successCount: result.successCount,
        failureCount: result.failureCount,
        successRate: `${((result.successCount / result.totalTokens) * 100).toFixed(2)}%`,
      },
    };

    // Include failure details if there are any (limit to first 50 to avoid huge responses)
    if (result.failureCount > 0) {
      response.failures = result.failures.slice(0, 50);
      if (result.failures.length > 50) {
        response.note = `Showing first 50 failures out of ${result.failures.length}`;
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Error in sendNotificationToAllUsers:", error);
    
    return res.status(500).json({
      success: false,
      message: "Internal server error while sending notifications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * Send notification to specific user
 */
async function sendNotificationToUser(req, res) {
  try {
    const {userId,title,body,data,imageUrl} = req.body;
    console.log(userId,title,body,imageUrl,data);
    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: "userId, title, and body are required",
      });
    }

    const user = await User.findById(userId, "fcmToken.token");

    if (!user || !user.fcmToken?.token) {
      return res.status(404).json({
        success: false,
        message: "User not found or user has no FCM token",
      });
    }

    const payload = {
      notification: { title, body, ...(imageUrl && { imageUrl }) },
      data: data || {},
    };

    const result = await FCMService.sendToToken(user.fcmToken.token, payload);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Notification sent successfully",
        messageId: result.messageId,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to send notification",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Error in sendNotificationToUser:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

module.exports = {
  sendNotificationToAllUsers,
  sendNotificationToUser,
}