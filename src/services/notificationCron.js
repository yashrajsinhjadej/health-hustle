const cron = require("node-cron");
const { sendNotificationToAllUsers } = require("../controllers/notification/adminNotificationController");

// 🕒 Schedule a cron job to run every day at 10:00 AM
// Format: second (optional) | minute | hour | day of month | month | day of week
// Example: "0 10 * * *" = 10:00 AM every day
const startNotificationCron = () => {
  console.log("🚀 Notification Cron Job initialized...");

  cron.schedule("5 11 * * *", async () => {
    console.log("⏰ Running scheduled notification task...");
    
    // You can define custom notification data here
    const fakeReq = {
      body: {
        title: "Daily Update 💬",
        body: "Here’s your daily notification from SmartHome Services!",
        data: { type: "daily_update" },
      },
    };

    // Fake res to avoid Express dependency
    const fakeRes = {
      status: () => ({ json: () => {} }),
    };

    try {
      await sendNotificationToAllUsers(fakeReq, fakeRes);
      console.log("✅ Scheduled notification sent successfully");
    } catch (err) {
      console.error("❌ Error in scheduled notification:", err);
    }
  });
};

module.exports = startNotificationCron;
