// workers/notificationWorker.js
require("dotenv").config();
const { Worker } = require("bullmq");
const Redis = require("ioredis");
const connectDB = require("../config/db");
const FCMService = require("../services/FCMService");
const NotificationSchedule = require("../models/NotificationSchedule");
const NotificationLog = require("../models/NotificationLog");
const NotificationHistory = require("../models/NotificationHistory");
const User = require("../models/User");
const { notificationQueue } = require("../queues/notificationQueue");
const Logger = require("../utils/logger");
const { getJobId } = require("../services/Notifications/timezoneJobService");
const { buildUserFilterQuery } = require("../utils/filterQueryBuilder");

(async () => {
  try {
    Logger.info("worker-startup", "⏳ Connecting to MongoDB...");
    await connectDB();
    await new Promise((r) => setTimeout(r, 1000));
    Logger.success("worker-startup", "✅ MongoDB connected. Starting BullMQ Worker...");

    const connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    connection.on("connect", () =>
      Logger.success("redis", "✅ Worker connected to Redis")
    );
    connection.on("error", (err) =>
      Logger.error("redis", "❌ Redis Worker error", { error: err.message })
    );

    const worker = new Worker(
      "notificationQueue",
      async (job) => {
        const requestId = Logger.generateId("notification-worker");
        Logger.info(requestId, `⚙️ Job started: ${job.name} (ID: ${job.id})`, job.data);

        switch (job.name) {
          case "instant-send-all":
          case "scheduled-once-send":  // Both are global sends (no timezone filter)
            return await handleInstantGlobalSend(job, requestId);

          case "daily-timezone-send":  // Only daily needs timezone-aware logic
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
 * 🎯 Handle notification send (instant, daily, scheduled_once)
 */
async function handleNotificationSend(job, requestId) {
  let { scheduleId, timezone } = job.data;

  // 🛑 ROOT FIX — Normalize timezone immediately
  // 🛑 ROOT FIX — Normalize timezone immediately
  const normalizedTimezone = timezone ? String(timezone).trim().toLowerCase() : null;

  Logger.info(requestId, "📦 Processing notification job", {
    jobName: job.name,
    scheduleId,
    originalTimezone: timezone,
    normalizedTimezone,
    jobId: job.id
  });

  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    Logger.error(requestId, "Schedule not found", { scheduleId });
    throw new Error("NotificationSchedule not found");
  }

  if (!schedule.isActive) {
    Logger.warn(requestId, `⚠️ Schedule ${scheduleId} inactive, skipping...`);
    return { skipped: true, reason: "schedule_inactive" };
  }

  // Build user query using CENTRALIZED filter file
  // Daily notifications are timezone-aware
  const userQuery = buildUserFilterQuery(schedule, normalizedTimezone, requestId);

  Logger.debug(requestId, "📋 User query built", {
    query: userQuery,
    timezone: normalizedTimezone
  });

  const users = await User.find(userQuery).lean();

  const validUsers = users.filter(u => {
    const t = u.fcmToken?.token;
    return t && typeof t === "string" && t.trim().length > 0;
  });

  Logger.info(requestId, `📊 Found ${validUsers.length} valid users`, {
    totalUsers: users.length,
    timezone: normalizedTimezone
  });

  // -- No Users --
  if (validUsers.length === 0) {
    await NotificationSchedule.findByIdAndUpdate(scheduleId, {
      totalTargeted: 0,
      status: schedule.scheduleType === "daily" ? "active" : "failed",
      lastRunAt: new Date(),
      lastRunStatus: "failed",
      failureReason: "No valid users found"
    });

    await NotificationHistory.create({
      scheduleId,
      firedAt: new Date(),
      totalTargeted: 0,
      successCount: 0,
      failureCount: 0,
      status: "failed",
      errorMessage: "No valid users found"
    });

    return { status: "no_users", timezone: normalizedTimezone };
  }

  // -- Schedule next daily job --
  if (schedule.scheduleType === "daily" && job.name === "daily-timezone-send") {
    const delayMs = calculateDelayForNextDay(schedule.scheduledTime);

    Logger.info(requestId, "🔄 Scheduling next daily notification", {
      normalizedTimezone,
      delayMs
    });

    const nextJobId = getJobId(scheduleId, normalizedTimezone);

    await notificationQueue.add(
      "daily-timezone-send",
      { scheduleId: schedule._id, timezone: normalizedTimezone },
      {
        delay: delayMs,
        jobId: nextJobId,
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    Logger.success(requestId, "✅ Next daily job scheduled", {
      jobId: nextJobId,
      nextRun: new Date(Date.now() + delayMs).toISOString()
    });
  }

  // Send Notification
  const tokens = validUsers.map(u => u.fcmToken.token);

  const payload = {
    notification: { title: schedule.title, body: schedule.message },
    data: { category: schedule.category || "Reminder", scheduleId: schedule._id.toString() }
  };

  const result = await FCMService.sendToMultipleTokens(tokens, payload);

  const retryable = result.failures.filter(f => isRetryableError(f.error));
  const permanent = result.failures.filter(f => !isRetryableError(f.error));

  if (permanent.length > 0) await deleteInvalidTokens(permanent, requestId);

  // Retry job
  if (retryable.length > 0) {
    await notificationQueue.add(
      "retry-failed-tokens",
      { scheduleId, failedTokens: retryable, attempt: 1, payload },
      { delay: 60000, attempts: 3, backoff: { type: "exponential", delay: 60000 } }
    );
  }

  // Save logs
  const logs = validUsers.map(u => ({
    userId: u._id,
    scheduleId,
    title: schedule.title,
    message: schedule.message,
    category: schedule.category || "Reminder",
    status: result.failures.some(f => f.token === u.fcmToken.token) ? "failed" : "sent",
    sentAt: new Date(),
    deviceToken: u.fcmToken.token
  }));

  await NotificationLog.insertMany(logs);

  // Save schedule history
  const total = validUsers.length;
  const successRate = result.successCount / total;

  let historyStatus = successRate === 1 ? "sent"
    : successRate >= 0.5 ? "partial_success"
      : "failed";

  await NotificationHistory.create({
    scheduleId,
    firedAt: new Date(),
    totalTargeted: total,
    successCount: result.successCount,
    failureCount: result.failureCount,
    status: historyStatus,
    errorMessage: historyStatus === "failed" ? "High failure rate" : null
  });

  Logger.success(requestId, "📬 Notification processed", {
    scheduleId,
    timezone: normalizedTimezone,
    successRate
  });

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    retryQueued: retryable.length,
    timezone: normalizedTimezone
  };
}

function isRetryableError(code) {
  return [
    "messaging/server-unavailable",
    "messaging/internal-error",
    "messaging/quota-exceeded",
    "messaging/timeout",
    "messaging/unavailable",
    "batch-error"
  ].includes(code);
}

async function deleteInvalidTokens(permanentFailures, requestId) {
  const invalidTokens = permanentFailures.map(f => f.token);
  await User.updateMany(
    { "fcmToken.token": { $in: invalidTokens } },
    { $unset: { fcmToken: "" } }
  );
  Logger.info(requestId, `🗑️ Deleted ${invalidTokens.length} invalid tokens`);
}

function calculateDelayForNextDay(scheduledTime) {
  const [h, m] = scheduledTime.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(h, m, 0, 0);
  return next - now;
}

/**
 * 🌍 Handle Global Instant Send (No Timezone Split)
 */
async function handleInstantGlobalSend(job, requestId) {
  const { scheduleId } = job.data;

  Logger.info(requestId, "🌍 Processing GLOBAL INSTANT notification", { scheduleId, jobId: job.id });

  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    Logger.error(requestId, "Schedule not found", { scheduleId });
    throw new Error("NotificationSchedule not found");
  }

  // Build query for ALL users (ignoring timezone)
  const userQuery = buildUserFilterQuery(schedule, null, requestId);

  Logger.debug(requestId, "📋 Global user query built", { query: userQuery });

  // Fetch ALL matching users
  const users = await User.find(userQuery).select("fcmToken _id").lean();

  const validUsers = users.filter(u => {
    const t = u.fcmToken?.token;
    return t && typeof t === "string" && t.trim().length > 0;
  });

  Logger.info(requestId, `📊 Found ${validUsers.length} total valid users for global send`, {
    totalFound: users.length
  });

  if (validUsers.length === 0) {
    await updateScheduleAsFailed(scheduleId, "No valid users found");
    await createHistoryEntry(scheduleId, 0, 0, 0, "failed", "No valid users found");
    return { status: "no_users" };
  }

  // Send to all tokens
  const tokens = validUsers.map(u => u.fcmToken.token);
  const payload = {
    notification: { title: schedule.title, body: schedule.message },
    data: { category: schedule.category || "Reminder", scheduleId: schedule._id.toString() }
  };

  // Send in one go (FCMService handles chunking internally usually, or we rely on it)
  const result = await FCMService.sendToMultipleTokens(tokens, payload);

  // Handle Retries & Invalid Tokens
  const retryable = result.failures.filter(f => isRetryableError(f.error));
  const permanent = result.failures.filter(f => !isRetryableError(f.error));

  if (permanent.length > 0) await deleteInvalidTokens(permanent, requestId);

  if (retryable.length > 0) {
    await notificationQueue.add(
      "retry-failed-tokens",
      { scheduleId, failedTokens: retryable, attempt: 1, payload },
      { delay: 60000, attempts: 3, backoff: { type: "exponential", delay: 60000 } }
    );
  }

  // Save Logs (Bulk Insert)
  const logs = validUsers.map(u => ({
    userId: u._id,
    scheduleId,
    title: schedule.title,
    message: schedule.message,
    category: schedule.category || "Reminder",
    status: result.failures.some(f => f.token === u.fcmToken.token) ? "failed" : "sent",
    sentAt: new Date(),
    deviceToken: u.fcmToken.token
  }));

  await NotificationLog.insertMany(logs);

  // Save ONE History Entry
  const total = validUsers.length;
  const successRate = result.successCount / total;
  const historyStatus = successRate === 1 ? "sent" : successRate >= 0.5 ? "partial_success" : "failed";

  await createHistoryEntry(scheduleId, total, result.successCount, result.failureCount, historyStatus, null);

  // Update Schedule Status
  await NotificationSchedule.findByIdAndUpdate(scheduleId, {
    status: "completed", // Instant/Scheduled-once are one-time sends
    lastRunAt: new Date(),
    lastRunStatus: historyStatus,
    totalTargeted: total
  });

  Logger.success(requestId, "🌍 Global Instant Notification Complete", {
    scheduleId,
    successCount: result.successCount,
    failureCount: result.failureCount
  });

  return { successCount: result.successCount, failureCount: result.failureCount };
}

// Helper to create history entry
async function createHistoryEntry(scheduleId, total, success, failure, status, errorMsg) {
  await NotificationHistory.create({
    scheduleId,
    firedAt: new Date(),
    totalTargeted: total,
    successCount: success,
    failureCount: failure,
    status: status,
    errorMessage: errorMsg
  });
}

async function updateScheduleAsFailed(scheduleId, reason) {
  await NotificationSchedule.findByIdAndUpdate(scheduleId, {
    status: "failed",
    lastRunAt: new Date(),
    lastRunStatus: "failed",
    failureReason: reason
  });
}
