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
const { getJobId, calculateNextOccurrenceInTimezone } = require("../services/Notifications/timezoneJobService");
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

        try {
          let result;
          
          switch (job.name) {
            case "instant-send-all":
            case "scheduled-once-send":
              result = await handleInstantGlobalSend(job, requestId);
              break;

            case "daily-timezone-send":
              result = await handleDailyTimezoneSend(job, requestId);
              break;

            case "retry-failed-tokens":
              result = await handleRetry(job, requestId);
              break;

            default:
              throw new Error(`Unknown job type: ${job.name}`);
          }

          Logger.success(requestId, `✅ Job ${job.id} completed`, result);
          return result;

        } catch (error) {
          Logger.error(requestId, `❌ Job ${job.id} failed`, { 
            error: error.message,
            stack: error.stack 
          });
          throw error;
        }
      },
      {
        connection,
        removeOnComplete: { age: 0 },
        removeOnFail: { age: 0 },
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
 * 🎯 Handle DAILY timezone-aware notification send
 * This is called when it's time to send notification for a specific timezone
 */
async function handleDailyTimezoneSend(job, requestId) {
  const startTime = Date.now();
  let { scheduleId, timezone } = job.data;

  const normalizedTimezone = timezone ? String(timezone).trim().toLowerCase() : null;

  Logger.info(requestId, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Logger.info(requestId, "🔥 DAILY JOB FIRED", {
    jobId: job.id,
    jobName: job.name,
    scheduleId,
    timezone: normalizedTimezone,
    firedAt: new Date().toISOString()
  });
  Logger.info(requestId, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Step 1: Fetch schedule
  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    Logger.error(requestId, "❌ Schedule not found", { scheduleId });
    throw new Error("NotificationSchedule not found");
  }

  if (!schedule.isActive) {
    Logger.warn(requestId, `⚠️ Schedule ${scheduleId} is inactive, skipping...`);
    return { skipped: true, reason: "schedule_inactive" };
  }

  Logger.info(requestId, "✅ Schedule found and active", {
    title: schedule.title,
    scheduleType: schedule.scheduleType,
    scheduledTime: schedule.scheduledTime
  });

  // Step 2: Find users
  const userQuery = buildUserFilterQuery(schedule, normalizedTimezone, requestId);
  Logger.debug(requestId, "📋 User query built", { query: userQuery });

  const users = await User.find(userQuery).lean();
  const validUsers = users.filter(u => {
    const t = u.fcmToken?.token;
    return t && typeof t === "string" && t.trim().length > 0;
  });

  Logger.info(requestId, `📊 User count`, {
    totalFound: users.length,
    validUsers: validUsers.length,
    timezone: normalizedTimezone
  });

  // Step 3: Handle no users case
  if (validUsers.length === 0) {
    Logger.warn(requestId, "⚠️ No valid users found");
    
    await NotificationSchedule.findByIdAndUpdate(scheduleId, {
      totalTargeted: 0,
      status: "active", // Keep daily schedules active
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

    // Even with no users, schedule next occurrence
    await scheduleNextOccurrence(scheduleId, normalizedTimezone, schedule.scheduledTime, requestId);

    return { status: "no_users", timezone: normalizedTimezone };
  }

  // Step 4: Send notifications
  Logger.info(requestId, "📤 Sending notifications...");
  
  const tokens = validUsers.map(u => u.fcmToken.token);
  const payload = {
    notification: { 
      title: schedule.title, 
      body: schedule.message 
    },
    data: { 
      category: schedule.category || "Reminder", 
      scheduleId: schedule._id.toString() 
    }
  };

  const result = await FCMService.sendToMultipleTokens(tokens, payload);

  Logger.info(requestId, "📬 FCM result", {
    successCount: result.successCount,
    failureCount: result.failureCount
  });

  // Step 5: Handle failures
  const retryable = result.failures.filter(f => isRetryableError(f.error));
  const permanent = result.failures.filter(f => !isRetryableError(f.error));

  if (permanent.length > 0) {
    await deleteInvalidTokens(permanent, requestId);
  }

  if (retryable.length > 0) {
    Logger.info(requestId, `🔄 Queueing ${retryable.length} retries`);
    await notificationQueue.add(
      "retry-failed-tokens",
      { scheduleId, failedTokens: retryable, attempt: 1, payload },
      { delay: 60000, attempts: 3, backoff: { type: "exponential", delay: 60000 } }
    );
  }

  // Step 6: Save logs
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

  // Step 7: Save history
  const total = validUsers.length;
  const successRate = result.successCount / total;
  const historyStatus = successRate === 1 ? "sent"
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

  await NotificationSchedule.findByIdAndUpdate(scheduleId, {
    totalTargeted: total,
    lastRunAt: new Date(),
    lastRunStatus: historyStatus
  });

  // Step 8: Check for new timezones
  Logger.info(requestId, "🔍 Checking for new timezones...");
  await checkForNewTimezonesAndCreateJobs(requestId,normalizedTimezone);

  // Step 9: Schedule next occurrence for THIS timezone
  const processingTime = Date.now() - startTime;
  Logger.info(requestId, `⏱️ Processing completed in ${processingTime}ms`);
  
  await scheduleNextOccurrence(scheduleId, normalizedTimezone, schedule.scheduledTime, requestId);

  Logger.info(requestId, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Logger.success(requestId, "✅ DAILY JOB COMPLETED SUCCESSFULLY");
  Logger.info(requestId, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    retryQueued: retryable.length,
    timezone: normalizedTimezone,
    processingTimeMs: processingTime
  };
}

/**
 * 🔄 Schedule the NEXT occurrence for a timezone
 * Creates a new job - BullMQ prevents duplicates automatically via jobId
 * The current job will auto-remove itself after completion
 */
async function scheduleNextOccurrence(scheduleId, timezone, scheduledTime, requestId) {
  Logger.info(requestId, "━━━ SCHEDULING NEXT OCCURRENCE ━━━");

  try {
    // Calculate delay for next occurrence
    // FOR TESTING: Use 60 seconds 
    const delayMs = 1 * 60 * 1000;
    
    // FOR PRODUCTION: Use this instead
    // const [hours, minutes] = scheduledTime.split(":").map(Number);
    // const now = new Date();
    // const next = new Date(now);
    // next.setDate(next.getDate() + 1);
    // next.setHours(hours, minutes, 0, 0);
    // const delayMs = next.getTime() - now.getTime();

    const nextFireTime = new Date(Date.now() + delayMs);
    
    // Generate UNIQUE job ID for next occurrence
    // Use timestamp to ensure each occurrence gets a unique ID
    const nextJobId = `${getJobId(scheduleId, timezone)}-${Date.now()}`;

    Logger.info(requestId, "⏰ Creating next occurrence", {
      timezone,
      delayMs,
      delaySeconds: Math.round(delayMs / 1000),
      nextFireTime: nextFireTime.toISOString(),
      nextJobId
    });

    // Create the next job
    // Current job will be auto-removed by BullMQ after this function completes
    const newJob = await notificationQueue.add(
      "daily-timezone-send",
      { scheduleId, timezone },
      {
        delay: delayMs,
        jobId: nextJobId,
        removeOnComplete: { count: 0 }, // Keep last 1 completed for reference
        removeOnFail: { count: 0 }
      }
    );

    Logger.success(requestId, "✅ NEXT JOB CREATED", {
      jobId: newJob.id,
      nextRun: nextFireTime.toISOString(),
      delay: `${Math.round(delayMs / 1000)}s`,
      willFireAt: nextFireTime.toLocaleString()
    });

    Logger.info(requestId, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  } catch (error) {
    Logger.error(requestId, "❌ ERROR scheduling next occurrence", {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * 🆕 Check for new timezones and create jobs for ALL active schedules
 */
async function checkForNewTimezonesAndCreateJobs(requestId, currentTimezone = null) {
  try {
    Logger.info(requestId, "🔍 Checking for new timezones in database");

    const activeSchedules = await NotificationSchedule.find({
      scheduleType: 'daily',
      isActive: true,
      status: 'active'
    }).lean();

    if (activeSchedules.length === 0) {
      Logger.info(requestId, "No active daily schedules found");
      return;
    }

    Logger.info(requestId, `Found ${activeSchedules.length} active daily schedules`);

    const allTimezones = await User.distinct("timezone", {
      isActive: true,
      "fcmToken.token": { $exists: true, $ne: null, $ne: "" }
    });

    const normalizedTimezones = [...new Set(
      allTimezones.map(tz => String(tz).trim().toLowerCase())
    )];

    Logger.debug(requestId, `Found ${normalizedTimezones.length} distinct timezones`, {
      timezones: normalizedTimezones
    });

    const existingJobs = await notificationQueue.getJobs(["waiting", "delayed", "active", "paused"]);

    const existingJobMap = new Set();
    for (const job of existingJobs) {
      if (job.name === "daily-timezone-send" && job.data.scheduleId && job.data.timezone) {
        const key = `${job.data.scheduleId.toString()}_${String(job.data.timezone).trim().toLowerCase()}`;
        existingJobMap.add(key);
      }
    }

    Logger.debug(requestId, `Found ${existingJobMap.size} existing daily jobs in queue`);

    let totalJobsCreated = 0;

    for (const schedule of activeSchedules) {
      const scheduleQuery = buildUserFilterQuery(schedule, null, requestId);
      const scheduleTimezones = await User.distinct("timezone", scheduleQuery);

      const normalizedScheduleTimezones = [...new Set(
        scheduleTimezones.map(tz => String(tz).trim().toLowerCase())
      )];

      for (const timezone of normalizedScheduleTimezones) {
        // CRITICAL: Skip the current timezone - it's already being handled by scheduleNextOccurrence()
        if (currentTimezone && timezone === String(currentTimezone).trim().toLowerCase()) {
          Logger.debug(requestId, `Skipping current timezone ${timezone} - already handled by scheduleNextOccurrence`);
          continue;
        }

        const jobKey = `${schedule._id.toString()}_${timezone}`;

        if (!existingJobMap.has(jobKey)) {
          try {
            const utcFireTime = calculateNextOccurrenceInTimezone(schedule.scheduledTime, timezone);
            const delayMs = Math.max(utcFireTime.getTime() - Date.now(), 0);
            
            // Generate job ID WITH timestamp to ensure uniqueness
            const jobId = `${getJobId(schedule._id, timezone)}-${Date.now()}`;

            await notificationQueue.add(
              "daily-timezone-send",
              { scheduleId: schedule._id, timezone },
              {
                delay: delayMs,
                jobId,
                removeOnComplete: { count: 0 },
                removeOnFail: { count: 0 }
              }
            );

            totalJobsCreated++;

            Logger.success(requestId, "✅ Created job for new timezone", {
              scheduleId: schedule._id,
              timezone,
              jobId
            });

            existingJobMap.add(jobKey);

          } catch (error) {
            Logger.error(requestId, "Failed to create job for new timezone", {
              scheduleId: schedule._id,
              timezone,
              error: error.message
            });
          }
        }
      }
    }

    if (totalJobsCreated > 0) {
      Logger.success(requestId, `🎉 Created ${totalJobsCreated} jobs for new timezones`);
    } else {
      Logger.info(requestId, "✅ No new timezones found - all covered");
    }

  } catch (error) {
    Logger.error(requestId, "Error checking for new timezones", {
      error: error.message,
      stack: error.stack
    });
  }
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

  const userQuery = buildUserFilterQuery(schedule, null, requestId);
  const users = await User.find(userQuery).select("fcmToken _id").lean();

  const validUsers = users.filter(u => {
    const t = u.fcmToken?.token;
    return t && typeof t === "string" && t.trim().length > 0;
  });

  Logger.info(requestId, `📊 Found ${validUsers.length} valid users`);

  if (validUsers.length === 0) {
    await updateScheduleAsFailed(scheduleId, "No valid users found");
    await createHistoryEntry(scheduleId, 0, 0, 0, "failed", "No valid users found");
    return { status: "no_users" };
  }

  const tokens = validUsers.map(u => u.fcmToken.token);
  const payload = {
    notification: { title: schedule.title, body: schedule.message },
    data: { category: schedule.category || "Reminder", scheduleId: schedule._id.toString() }
  };

  const result = await FCMService.sendToMultipleTokens(tokens, payload);

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

  const total = validUsers.length;
  const successRate = result.successCount / total;
  const historyStatus = successRate === 1 ? "sent" : successRate >= 0.5 ? "partial_success" : "failed";

  await createHistoryEntry(scheduleId, total, result.successCount, result.failureCount, historyStatus, null);

  await NotificationSchedule.findByIdAndUpdate(scheduleId, {
    status: "completed",
    lastRunAt: new Date(),
    lastRunStatus: historyStatus,
    totalTargeted: total
  });

  Logger.success(requestId, "🌍 Global Instant Notification Complete");

  return { successCount: result.successCount, failureCount: result.failureCount };
}

/**
 * 🔄 Handle retry of failed tokens
 */
async function handleRetry(job, requestId) {
  Logger.info(requestId, "🔄 Retrying failed tokens", { attempt: job.data.attempt });
  // Add your retry logic here
  return { retried: true };
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