// services/Notifications/timezoneJobService.js
const NotificationSchedule = require("../../models/NotificationSchedule");
const User = require("../../models/User");
const { notificationQueue } = require("../../queues/notificationQueue");
const Logger = require("../../utils/logger");
const { buildUserFilterQuery } = require("../../utils/filterQueryBuilder");
const moment = require("moment-timezone");

/**
 * 🔧 Generate consistent jobId for a schedule + timezone
 * This ensures no duplicate jobs are created
 */
function getJobId(scheduleId, timezone) {
  return `daily-${scheduleId}-${timezone}`;
}

/**
 * Create jobs for all timezones (used by admin when creating/resuming DAILY notifications)
 */
async function createDailyTimezoneJobs(scheduleId) {
  const requestId = Logger.generateId("queue-timezone");

  Logger.info(requestId, "Queueing DAILY timezone jobs", { scheduleId });

  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    Logger.error(requestId, "Schedule not found", { scheduleId });
    throw new Error("Schedule not found");
  }

  // --- Build base query (without timezone) ---
  let baseQuery;

  if (schedule.targetAudience === "filtered") {
    // Use filter query builder for filtered notifications
    baseQuery = buildUserFilterQuery(schedule, null, requestId);
    Logger.info(requestId, "Using filtered query", {
      filters: schedule.filters,
      query: baseQuery
    });
  } else {
    // Default query for "all" users
    baseQuery = {
      isActive: true,
      "fcmToken.token": { $exists: true, $ne: null, $ne: "" },
      $or: [
        { notificationsEnabled: true },
        { notificationsEnabled: { $exists: false } },
      ],
    };
    Logger.info(requestId, "Using 'all users' query");
  }

  // --- Get distinct timezones based on the query ---
  const rawTimezones = await User.distinct("timezone", baseQuery);

  // Normalize and deduplicate timezones to match ensureDailyJobsForTimezone behavior
  const timezones = [...new Set(
    rawTimezones.map(tz => String(tz).trim().toLowerCase())
  )];

  Logger.debug(requestId, "Fetched and normalized distinct timezones", {
    rawCount: rawTimezones.length,
    normalizedCount: timezones.length,
    timezones: timezones
  });

  if (timezones.length === 0) {
    Logger.warn(requestId, "No users found matching filters", {
      targetAudience: schedule.targetAudience,
      filters: schedule.filters,
    });

    // Update schedule status
    await NotificationSchedule.findByIdAndUpdate(scheduleId, {
      status: "failed",
      failureReason: "No users found matching the specified filters",
    });
    return { noRecipients: true };
  }

  // --- Queue jobs for each timezone ---
  const jobsCreated = [];

  for (const timezone of timezones) {

    // Calculate next occurrence for DAILY
    const utcFireTime = calculateNextOccurrenceInTimezone(schedule.scheduledTime, timezone);

    const delayMs = Math.max(utcFireTime.getTime() - Date.now(), 0);

    // 🔑 Use consistent jobId for daily schedules
    const jobOptions = {
      delay: delayMs,
      jobId: getJobId(schedule._id, timezone),
      removeOnComplete: true,
      removeOnFail: false
    };

    Logger.debug(requestId, "Queueing job for timezone", {
      timezone,
      fireTime: utcFireTime.toISOString(),
      delayMs,
      jobId: jobOptions.jobId
    });

    const job = await notificationQueue.add(
      "daily-timezone-send",
      { scheduleId: schedule._id, timezone },
      jobOptions
    );

    jobsCreated.push({
      timezone,
      jobId: job.id,
      nextRunAt: new Date(Date.now() + delayMs)
    });
  }

  Logger.success(requestId, "All timezone jobs queued", {
    scheduleId,
    timezoneCount: timezones.length,
    targetAudience: schedule.targetAudience,
    jobsCreated: jobsCreated.length
  });

  return { jobsCreated };
}

/**
 * Calculate next occurrence in a specific timezone
 * Returns UTC Date object
 */
function calculateNextOccurrenceInTimezone(scheduledTime, timezone) {
  const [hours, minutes] = scheduledTime.split(":").map(Number);

  const nowInTz = moment.tz(timezone);
  const fireTimeInTz = nowInTz
    .clone()
    .hours(hours)
    .minutes(minutes)
    .seconds(0)
    .milliseconds(0);

  if (fireTimeInTz.isBefore(nowInTz)) {
    fireTimeInTz.add(1, "day");
  }

  return fireTimeInTz.utc().toDate();
}

/**
 * 🎯 Ensure daily notification jobs exist for a specific timezone
 * Called when user registers/changes timezone or opens app
 * This creates jobs for ALL active daily schedules
 */
async function ensureDailyJobsForTimezone(timezone, userId) {
  try {
    // Normalize timezone ALWAYS (fixes duplicate jobs forever)
    const normalizedTimezone = timezone.trim().toLowerCase();

    console.log('[ensureDailyJobs] Checking for timezone:', normalizedTimezone, 'userId:', userId);

    // 🔍 Get all active daily schedules
    const activeSchedules = await NotificationSchedule.find({
      scheduleType: 'daily',
      isActive: true,
      status: 'active'
    }).lean();

    if (activeSchedules.length === 0) {
      console.log('[ensureDailyJobs] No active daily schedules found');
      return { success: true, jobsCreated: 0, jobsSkipped: 0 };
    }

    console.log(`[ensureDailyJobs] Found ${activeSchedules.length} active daily schedules`);

    let jobsCreated = 0;
    let jobsSkipped = 0;

    // 🔄 For each schedule, check if job exists for this timezone
    for (const schedule of activeSchedules) {

      // 🔑 Use consistent jobId with normalized timezone
      const jobId = getJobId(schedule._id, normalizedTimezone);

      try {
        // Check if job exists
        const existingJob = await notificationQueue.getJob(jobId);

        if (existingJob) {
          console.log('[ensureDailyJobs] Job already exists', {
            scheduleId: schedule._id,
            scheduleTitle: schedule.title,
            timezone: normalizedTimezone,
            jobId,
            nextRunAt:
              existingJob.processedOn
                ? new Date(existingJob.processedOn + existingJob.opts.delay)
                : 'unknown'
          });

          jobsSkipped++;
          continue;
        }

        // ✨ Create new job for this normalized timezone
        console.log('[ensureDailyJobs] Creating new job', {
          scheduleId: schedule._id,
          scheduleTitle: schedule.title,
          timezone: normalizedTimezone,
          scheduledTime: schedule.scheduledTime,
          jobId
        });

        // Calculate next UTC fire time using normalized timezone
        const utcFireTime = calculateNextOccurrenceInTimezone(
          schedule.scheduledTime,
          normalizedTimezone
        );

        const delay = Math.max(utcFireTime.getTime() - Date.now(), 0);

        await notificationQueue.add(
          'daily-timezone-send',
          {
            scheduleId: schedule._id,
            timezone: normalizedTimezone
          },
          {
            delay,
            jobId,
            removeOnComplete: true,
            removeOnFail: false
          }
        );

        jobsCreated++;

        console.log('[ensureDailyJobs] ✅ Job created successfully', {
          scheduleId: schedule._id,
          scheduleTitle: schedule.title,
          timezone: normalizedTimezone,
          jobId,
          delayMs: delay,
          nextRunAt: new Date(Date.now() + delay).toISOString()
        });

      } catch (jobError) {
        console.error('[ensureDailyJobs] Error creating job for schedule', {
          scheduleId: schedule._id,
          scheduleTitle: schedule.title,
          timezone: normalizedTimezone,
          error: jobError.message
        });
        // Continue even if one schedule fails
      }
    }

    console.log('[ensureDailyJobs] ✅ Completed for timezone:', normalizedTimezone, {
      jobsCreated,
      jobsSkipped,
      totalSchedules: activeSchedules.length
    });

    return { success: true, jobsCreated, jobsSkipped };

  } catch (error) {
    console.error('[ensureDailyJobs] Fatal error:', error.message);
    throw error;
  }
}
/**
 * 🧹 Cleanup jobs for a specific timezone and schedule
 * Used when pausing/deleting schedules
 */
async function cleanupJobsForSchedule(scheduleId, requestId) {
  try {
    Logger.info(requestId, "🧹 Cleaning up jobs for schedule", { scheduleId });

    const jobs = await notificationQueue.getJobs([
      "waiting",
      "delayed",
      "active",
      "paused",
    ]);

    let removedCount = 0;

    for (const job of jobs) {
      if (
        job.data.scheduleId &&
        job.data.scheduleId.toString() === scheduleId.toString()
      ) {
        await job.remove();
        removedCount++;
        Logger.debug(requestId, "Removed job", {
          jobId: job.id,
          jobName: job.name,
          timezone: job.data.timezone
        });
      }
    }

    Logger.success(requestId, "Cleanup complete", {
      scheduleId,
      removedCount,
    });

    return { removedCount };
  } catch (error) {
    Logger.error(requestId, "Error cleaning up jobs", {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  createDailyTimezoneJobs,
  ensureDailyJobsForTimezone,
  calculateNextOccurrenceInTimezone,
  cleanupJobsForSchedule,
  getJobId
};