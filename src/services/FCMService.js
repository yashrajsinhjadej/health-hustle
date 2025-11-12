// File: services/FCMService.js
const admin = require("../config/firebase");

class FCMService {
  /**
   * Send notification to a single device token
   */
  static async sendToToken(token, payload) {
    try {
      const message = this.buildMessage(token, payload);
      const response = await admin.messaging().send(message);
      console.log(`✅ Notification sent successfully to token: ${token.substring(0, 20)}...`);
      return { success: true, messageId: response };
    } catch (error) {
      console.error(`❌ Error sending to token ${token.substring(0, 20)}...:`, error.message);
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Send notification to multiple tokens (up to 500 per batch)
   */
  static async sendToMultipleTokens(tokens, payload) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new Error("Tokens must be a non-empty array");
    }

    if (!payload?.notification?.title || !payload?.notification?.body) {
      throw new Error("Payload must include notification.title and notification.body");
    }

    const BATCH_SIZE = 500; // FCM limit per multicast
    let totalSuccess = 0;
    let totalFailure = 0;
    const allFailures = [];

    // Process tokens in batches
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      
      try {
        const message = this.buildMulticastMessage(batch, payload);
        const response = await admin.messaging().sendEachForMulticast(message);

        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        // Collect failed tokens with error details
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            allFailures.push({
              token: batch[idx],
              error: resp.error?.code || "unknown-error",
              message: resp.error?.message || "Failed to send notification",
            });
          }
        });

        console.log(
          `📊 Batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
          `Success=${response.successCount}, Failed=${response.failureCount}`
        );
      } catch (error) {
        console.error(`❌ Batch error:`, error.message);
        // Mark entire batch as failed
        batch.forEach(token => {
          allFailures.push({
            token,
            error: "batch-error",
            message: error.message,
          });
        });
        totalFailure += batch.length;
      }
    }

    return {
      successCount: totalSuccess,
      failureCount: totalFailure,
      failures: allFailures,
      totalTokens: tokens.length,
    };
  }

  /**
   * Send notification to a topic
   */
  static async sendToTopic(topic, payload) {
    try {
      const message = {
        ...this.formatPayload(payload),
        topic: topic,
      };

      const response = await admin.messaging().send(message);
      console.log(`✅ Notification sent to topic "${topic}":`, response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error(`❌ Error sending to topic "${topic}":`, error.message);
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Build message for single token
   */
  static buildMessage(token, payload) {
    return {
      token,
      ...this.formatPayload(payload),
    };
  }

  /**
   * Build message for multiple tokens (multicast)
   */
  static buildMulticastMessage(tokens, payload) {
    return {
      tokens,
      ...this.formatPayload(payload),
    };
  }

  /**
   * Format payload to FCM message format
   */
  static formatPayload(payload) {
    const message = {};

    // Notification payload
    if (payload.notification) {
      message.notification = {
        title: payload.notification.title,
        body: payload.notification.body,
        ...(payload.notification.imageUrl && { imageUrl: payload.notification.imageUrl }),
      };
    }

    // Data payload (all values must be strings)
    if (payload.data) {
      message.data = {};
      Object.entries(payload.data).forEach(([key, value]) => {
        message.data[key] = String(value);
      });
    }

    // Android-specific config
    if (payload.android) {
      message.android = {
        priority: payload.android.priority || "high",
        notification: {
          sound: payload.android.sound || "default",
          ...payload.android.notification,
        },
        ...payload.android,
      };
    }

    // iOS-specific config
    if (payload.apns) {
      message.apns = {
        payload: {
          aps: {
            sound: payload.apns.sound || "default",
            badge: payload.apns.badge,
            ...payload.apns.aps,
          },
        },
        ...payload.apns,
      };
    }

    // Web push config
    if (payload.webpush) {
      message.webpush = payload.webpush;
    }

    return message;
  }

  /**
   * Subscribe tokens to a topic
   */
  static async subscribeToTopic(tokens, topic) {
    try {
      const response = await admin.messaging().subscribeToTopic(tokens, topic);
      console.log(`✅ Subscribed ${response.successCount} tokens to topic "${topic}"`);
      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        errors: response.errors,
      };
    } catch (error) {
      console.error(`❌ Error subscribing to topic:`, error.message);
      throw error;
    }
  }

  /**
   * Unsubscribe tokens from a topic
   */
  static async unsubscribeFromTopic(tokens, topic) {
    try {
      const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
      console.log(`✅ Unsubscribed ${response.successCount} tokens from topic "${topic}"`);
      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        errors: response.errors,
      };
    } catch (error) {
      console.error(`❌ Error unsubscribing from topic:`, error.message);
      throw error;
    }
  }
}

module.exports = FCMService;