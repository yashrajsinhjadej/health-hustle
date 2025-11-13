require("dotenv").config();
const { Worker } = require("bullmq");
const Redis = require("ioredis");
const connectDB = require("../utils/mongoConnect");
const FCMService = require("../services/FCMService");
const NotificationSchedule = require("../models/NotificationSchedule");
const NotificationLog = require("../models/NotificationLog");
const NotificationHistory = require("../models/NotificationHistory"); // ✨ NEW
const User = require("../models/User");
const { notificationQueue } = require("../queues/notificationQueue");
const Logger = require("../utils/logger");

(async () => {
  try {
    // 🟡 MongoDB Connection
    Logger.info("worker-startup", "⏳ Connecting to MongoDB...");
    await connectDB();
    await new Promise((r) => setTimeout(r, 1000));
    Logger.success("worker-startup", "✅ MongoDB connected. Starting BullMQ Worker...");

    // 🔴 Redis Connection
    const connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    connection.on("connect", () =>
      Logger.success("redis", "✅ Worker connected to Redis")
    );
    connection.on("error", (err) =>
      Logger.error("redis", "❌ Redis Worker error", { error: err.message })
    );

    // ⚙️ Worker Logic
    const worker = new Worker(
      "notificationQueue",
      async (job) => {
        const requestId = Logger.generateId("notification-worker");
        Logger.info(requestId, `⚙️ Job started: ${job.name} (ID: ${job.id})`, job.data);

        // Route to appropriate handler
        switch (job.name) {
          case "instant-timezone-send":
          case "daily-timezone-send":
          case "scheduled-once-send":
            return await handleNotificationSend(job, requestId);

          case "retry-failed-tokens":
            return await handleRetry(job, requestId);

          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      },
      {
        connection,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      }
    );

    // 🎉 Worker Event Listeners
    worker.on("completed", (job) =>
      Logger.success("worker", `🎉 Job ${job.id} completed successfully`)
    );

    worker.on("failed", (job, err) =>
      Logger.error("worker", `❌ Job ${job.id} failed`, { error: err.message })
    );

    Logger.success("worker", "✅ Worker ready and listening for jobs...");
  } catch (error) {
    Logger.error("worker-startup", "❌ Worker startup failed", { error: error.message });
  }
})();

/**
 * Handle notification send (instant, daily, scheduled_once)
 */
async function handleNotificationSend(job, requestId) {
  const { scheduleId, timezone } = job.data;
  const schedule = await NotificationSchedule.findById(scheduleId);

  if (!schedule) throw new Error("NotificationSchedule not found");
  if (!schedule.isActive) {
    Logger.warn(requestId, `⚠️ Schedule ${scheduleId} inactive, skipping...`);
    return { skipped: true };
  }

  // For daily schedules, reschedule BEFORE processing (safety first)
  if (schedule.scheduleType === "daily" && job.name === "daily-timezone-send") {
    const delayMs = calculateDelayForNextDay(schedule.scheduledTime);
    Logger.info(requestId, "🔄 Pre-scheduling next daily notification", {
      delayMs,
      timezone,
    });

    await notificationQueue.add(
      "daily-timezone-send",
      { scheduleId: schedule._id, timezone },
      { delay: delayMs }
    );
  }

  // 🎯 Eligible users (with valid FCM tokens)
  const userQuery = {
    "fcmToken.token": { $exists: true, $ne: null, $ne: "" },
    $or: [
      { notificationsEnabled: true },
      { notificationsEnabled: { $exists: false } },
    ],
  };
  if (timezone) userQuery.timezone = timezone;

  const users = await User.find(userQuery).lean();
  Logger.info(requestId, `📊 Found ${users.length} users`, { timezone });

  if (!users.length) {
    const update = {
      status: schedule.scheduleType === "daily" ? "active" : "failed",
      failureReason: "No valid users found",
      totalTargeted: 0,
    };

    if (schedule.scheduleType === "daily") {
      update.lastRunStatus = "failed";
      update.lastRunAt = new Date();
    }

    await NotificationSchedule.findByIdAndUpdate(scheduleId, update);
    
    // ✨ Save to NotificationHistory
    await NotificationHistory.create({
      scheduleId,
      firedAt: new Date(),
      totalTargeted: 0,
      successCount: 0,
      failureCount: 0,
      status: "failed",
      errorMessage: "No valid users found",
    });
    
    throw new Error("No users with valid FCM tokens found");
  }

  // 📨 Build FCM payload
  const payload = {
    notification: {
      title: schedule.title,
      body: schedule.message,
    },
  };

  // 🚀 Send to all tokens
  const tokens = users.map((u) => u.fcmToken?.token).filter(Boolean);
  const result = await FCMService.sendToMultipleTokens(tokens, payload);

  Logger.debug(requestId, "📦 FCM Result", result);

  // 🔍 Separate failures into retryable vs permanent
  const retryableFailures = result.failures.filter((f) => isRetryableError(f.error));
  const permanentFailures = result.failures.filter((f) => !isRetryableError(f.error));

  Logger.info(requestId, "📊 Failure analysis", {
    total: result.failures.length,
    retryable: retryableFailures.length,
    permanent: permanentFailures.length,
  });

  // 🗑️ Delete permanently failed tokens
  if (permanentFailures.length > 0) {
    await deleteInvalidTokens(permanentFailures, requestId);
  }

  // 🔄 Queue retry job for transient failures
  if (retryableFailures.length > 0) {
    Logger.info(requestId, `🔄 Queueing retry for ${retryableFailures.length} failed tokens`);
    
    await notificationQueue.add(
      "retry-failed-tokens",
      {
        scheduleId: schedule._id,
        failedTokens: retryableFailures,
        attempt: 1,
        payload,
      },
      {
        delay: 60000, // 1 minute initial delay
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 60000, // 1min, 2min, 4min
        },
      }
    );
  }

  // 🗂️ Save per-user logs
  const logs = users.map((user) => {
    const tokenFailed = result.failures.some((f) => f.token === user.fcmToken?.token);
    return {
      userId: user._id,
      scheduleId,
      title: schedule.title,
      message: schedule.message,
      status: tokenFailed ? "failed" : "sent",
      sentAt: new Date(),
      deviceToken: user.fcmToken?.token,
    };
  });
  await NotificationLog.insertMany(logs);

  // 📈 Delivery Stats Calculation
  const totalUsers = users.length;
  const successRate = (result.successCount / totalUsers) * 100;

  const update = {
    sentAt: new Date(),
    totalTargeted: totalUsers,
    successCount: result.successCount,
    failureCount: result.failureCount,
  };

  // Determine status based on schedule type
  let historyStatus;
  let historyErrorMessage;

  if (schedule.scheduleType === "daily") {
    update.status = "active"; // Keep daily active
    update.lastRunAt = new Date();
    update.nextRunAt = new Date(Date.now() + calculateDelayForNextDay(schedule.scheduledTime));

    if (result.successCount === 0) {
      update.lastRunStatus = "failed";
      update.failureReason = "All tokens failed during FCM delivery";
      historyStatus = "failed";
      historyErrorMessage = "All tokens failed during FCM delivery";
    } else if (successRate === 100) {
      update.lastRunStatus = "completed";
      update.failureReason = undefined;
      historyStatus = "sent";
    } else if (successRate >= 50) {
      update.lastRunStatus = "partial_success";
      update.failureReason = `${result.failureCount} tokens failed, ${result.successCount} succeeded`;
      historyStatus = "partial_success";
      historyErrorMessage = `${result.failureCount} tokens failed, ${result.successCount} succeeded`;
    } else {
      update.lastRunStatus = "failed";
      update.failureReason = `${result.failureCount} failed out of ${totalUsers} users`;
      historyStatus = "failed";
      historyErrorMessage = `${result.failureCount} failed out of ${totalUsers} users`;
    }
  } else {
    // For instant and scheduled_once
    if (result.successCount === 0) {
      update.status = "failed";
      update.failureReason = "All tokens failed during FCM delivery";
      historyStatus = "failed";
      historyErrorMessage = "All tokens failed during FCM delivery";
    } else if (successRate === 100) {
      update.status = "completed";
      historyStatus = "sent";
    } else if (successRate >= 50) {
      update.status = "partial_success";
      update.failureReason = `${result.failureCount} tokens failed, ${result.successCount} succeeded`;
      historyStatus = "partial_success";
      historyErrorMessage = `${result.failureCount} tokens failed, ${result.successCount} succeeded`;
    } else {
      update.status = "failed";
      update.failureReason = `${result.failureCount} failed out of ${totalUsers} users`;
      historyStatus = "failed";
      historyErrorMessage = `${result.failureCount} failed out of ${totalUsers} users`;
    }
  }

  // 💾 Save schedule update
  await NotificationSchedule.findByIdAndUpdate(scheduleId, update);
  
  // ✨ Save to NotificationHistory
  await NotificationHistory.create({
    scheduleId,
    firedAt: new Date(),
    totalTargeted: totalUsers,
    successCount: result.successCount,
    failureCount: result.failureCount,
    status: historyStatus,
    errorMessage: historyErrorMessage,
  });
  
  Logger.success(requestId, `📬 Schedule ${scheduleId} processed`, {
    scheduleType: schedule.scheduleType,
    status: update.status,
    lastRunStatus: update.lastRunStatus,
    successRate: `${successRate.toFixed(1)}%`,
  });

  Logger.success(
    requestId,
    `✅ Job ${job.id} completed: ${result.successCount} sent / ${result.failureCount} failed`
  );

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    retryQueued: retryableFailures.length,
    tokensDeleted: permanentFailures.length,
  };
}

/**
 * Handle retry for failed tokens
 */
async function handleRetry(job, requestId) {
  const { scheduleId, failedTokens, attempt, payload } = job.data;

  Logger.info(requestId, `🔄 Retry attempt ${attempt} for ${failedTokens.length} tokens`);

  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    Logger.error(requestId, "Schedule not found for retry", { scheduleId });
    return { skipped: true };
  }

  const tokens = failedTokens.map((f) => f.token);
  const result = await FCMService.sendToMultipleTokens(tokens, payload);

  Logger.info(requestId, `📊 Retry result: ${result.successCount} sent / ${result.failureCount} failed`);

  // Separate again
  const stillRetryable = result.failures.filter((f) => isRetryableError(f.error));
  const nowPermanent = result.failures.filter((f) => !isRetryableError(f.error));

  // Delete tokens that are now permanently failed
  if (nowPermanent.length > 0) {
    await deleteInvalidTokens(nowPermanent, requestId);
  }

  // If still have retryable failures and attempts left
  if (stillRetryable.length > 0 && attempt < 3) {
    Logger.info(requestId, `🔄 Queueing retry attempt ${attempt + 1}`);
    
    await notificationQueue.add(
      "retry-failed-tokens",
      {
        scheduleId,
        failedTokens: stillRetryable,
        attempt: attempt + 1,
        payload,
      },
      {
        delay: 60000 * Math.pow(2, attempt), // Exponential backoff
        attempts: 1,
      }
    );
  } else if (stillRetryable.length > 0) {
    Logger.warn(requestId, `⚠️ Max retries reached. ${stillRetryable.length} tokens still failing`, {
      tokens: stillRetryable.map((f) => ({ token: f.token.substring(0, 20), error: f.error })),
    });
  }

  // Update schedule stats
  await NotificationSchedule.findByIdAndUpdate(scheduleId, {
    $inc: {
      successCount: result.successCount,
      failureCount: result.failureCount - nowPermanent.length, // Don't count deleted tokens
    },
  });

  return {
    retryAttempt: attempt,
    successCount: result.successCount,
    failureCount: result.failureCount,
    stillRetrying: stillRetryable.length,
  };
}

/**
 * Check if error is retryable (transient) or permanent
 */
function isRetryableError(errorCode) {
  const retryableErrors = [
    "messaging/server-unavailable",
    "messaging/internal-error",
    "messaging/quota-exceeded",
    "messaging/timeout",
    "messaging/unavailable",
    "batch-error",
  ];

  return retryableErrors.includes(errorCode);
}

/**
 * Delete invalid FCM tokens from User collection
 */
async function deleteInvalidTokens(permanentFailures, requestId) {
  const tokensToDelete = permanentFailures.map((f) => f.token);

  Logger.info(requestId, `🗑️ Deleting ${tokensToDelete.length} invalid tokens`, {
    errors: permanentFailures.map((f) => f.error),
  });

  const result = await User.updateMany(
    { "fcmToken.token": { $in: tokensToDelete } },
    { $unset: { fcmToken: "" } }
  );

  Logger.success(requestId, `✅ Deleted ${result.modifiedCount} invalid tokens from DB`);
}

/**
 * 🕐 Calculate delay for next day's occurrence
 */
function calculateDelayForNextDay(scheduledTime) {
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const now = new Date();
  const nextFireTime = new Date(now);
  nextFireTime.setDate(nextFireTime.getDate() + 1);
  nextFireTime.setHours(hours, minutes, 0, 0);
  return nextFireTime.getTime() - now.getTime();
}