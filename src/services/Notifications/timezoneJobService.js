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
 * ✨ Create jobs for all timezones
 * Called when admin creates/resumes a DAILY notification
 */
async function createDailyTimezoneJobs(scheduleId) {
  const requestId = Logger.generateId("queue-timezone");

  Logger.info(requestId, "Creating DAILY timezone jobs", { scheduleId });

  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    Logger.error(requestId, "Schedule not found", { scheduleId });
    throw new Error("Schedule not found");
  }

  // Build base query (without timezone filter)
  const baseQuery = buildUserFilterQuery(schedule, null, requestId);

  // Get distinct timezones from matching users
  const rawTimezones = await User.distinct("timezone", baseQuery);

  // Normalize timezones
  const timezones = [...new Set(
    rawTimezones.map(tz => String(tz).trim().toLowerCase())
  )];

  Logger.info(requestId, `Found ${timezones.length} distinct timezones`, { timezones });

  if (timezones.length === 0) {
    Logger.warn(requestId, "No users found matching filters");
    await NotificationSchedule.findByIdAndUpdate(scheduleId, {
      status: "failed",
      failureReason: "No users found matching the specified filters",
    });
    return { noRecipients: true };
  }

  // Create jobs for each timezone
  const jobsCreated = [];

  for (const timezone of timezones) {
    const jobId = getJobId(schedule._id, timezone);
    
    // Check if job already exists
    const existingJob = await notificationQueue.getJob(jobId);
    if (existingJob) {
      Logger.debug(requestId, "Job already exists, skipping", { jobId, timezone });
      continue;
    }

    const utcFireTime = calculateNextOccurrenceInTimezone(schedule.scheduledTime, timezone);
    const delayMs = Math.max(utcFireTime.getTime() - Date.now(), 0);

    Logger.debug(requestId, "Creating job", {
      timezone,
      jobId,
      fireTime: utcFireTime.toISOString(),
      delayMs
    });

    await notificationQueue.add(
      "daily-timezone-send",
      { scheduleId: schedule._id, timezone },
      {
        delay: delayMs,
        jobId, // ← Using consistent jobId prevents duplicates
        removeOnComplete: { count: 0 }, // Keep last completed for reference
        removeOnFail: { count: 5 }
      }
    );

    jobsCreated.push({
      timezone,
      jobId,
      nextRunAt: new Date(Date.now() + delayMs)
    });
  }

  Logger.success(requestId, `Created ${jobsCreated.length} timezone jobs`, {
    scheduleId,
    timezoneCount: timezones.length
  });

  return { jobsCreated };
}

/**
 * 🔄 Schedule the next occurrence for a timezone
 * Called by worker after sending notification
 */
async function scheduleNextDailyOccurrence(scheduleId, timezone, scheduledTime, requestId) {
  // Calculate next day same time
  const [h, m] = scheduledTime.split(":").map(Number);
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + 1);
  nextRun.setHours(h, m, 0, 0);
  const delayMs = nextRun.getTime() - Date.now();

  const jobId = getJobId(scheduleId, timezone);

  Logger.info(requestId, "Scheduling next daily occurrence", {
    timezone,
    jobId,
    nextRun: nextRun.toISOString()
  });

  // BullMQ won't create duplicate if jobId already exists
  await notificationQueue.add(
    "daily-timezone-send",
    { scheduleId, timezone },
    {
      delay: delayMs,
      jobId,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 5 }
    }
  );

  Logger.success(requestId, "Next occurrence scheduled", { jobId, timezone });
}

/**
 * 🆕 Ensure jobs exist for new timezones
 * Called periodically or when detecting new user timezones
 */
async function ensureJobsForNewTimezones(requestId) {
  try {
    Logger.info(requestId, "Checking for new timezones");

    // Get all active daily schedules
    const activeSchedules = await NotificationSchedule.find({
      scheduleType: 'daily',
      isActive: true,
      status: 'active'
    }).lean();

    if (activeSchedules.length === 0) {
      Logger.info(requestId, "No active daily schedules");
      return { jobsCreated: 0 };
    }

    let totalJobsCreated = 0;

    for (const schedule of activeSchedules) {
      // Get timezones for this schedule
      const baseQuery = buildUserFilterQuery(schedule, null, requestId);
      const rawTimezones = await User.distinct("timezone", baseQuery);
      const timezones = [...new Set(rawTimezones.map(tz => String(tz).trim().toLowerCase()))];

      // Check each timezone
      for (const timezone of timezones) {
        const jobId = getJobId(schedule._id, timezone);
        
        // Check if job exists (in any state: waiting, delayed, active, completed)
        const existingJob = await notificationQueue.getJob(jobId);
        
        if (!existingJob) {
          // Job doesn't exist - create it
          const utcFireTime = calculateNextOccurrenceInTimezone(schedule.scheduledTime, timezone);
          const delayMs = Math.max(utcFireTime.getTime() - Date.now(), 0);

          await notificationQueue.add(
            "daily-timezone-send",
            { scheduleId: schedule._id, timezone },
            {
              delay: delayMs,
              jobId,
              removeOnComplete: { count: 0 },
              removeOnFail: { count: 5 }
            }
          );

          totalJobsCreated++;

          Logger.success(requestId, "Created job for new timezone", {
            scheduleId: schedule._id,
            timezone,
            jobId,
            nextRun: new Date(Date.now() + delayMs).toISOString()
          });
        }
      }
    }

    if (totalJobsCreated > 0) {
      Logger.success(requestId, `Created ${totalJobsCreated} jobs for new timezones`);
    } else {
      Logger.info(requestId, "No new timezones - all covered");
    }

    return { jobsCreated: totalJobsCreated };

  } catch (error) {
    Logger.error(requestId, "Error checking new timezones", { error: error.message });
    return { jobsCreated: 0, error: error.message };
  }
}

/**
 * 🧹 Cleanup jobs for a schedule
 * Used when pausing/deleting schedules
 */
async function cleanupJobsForSchedule(scheduleId, requestId) {
  try {
    Logger.info(requestId, "Cleaning up jobs for schedule", { scheduleId });

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
          timezone: job.data.timezone
        });
      }
    }

    Logger.success(requestId, "Cleanup complete", { scheduleId, removedCount });

    return { removedCount };
  } catch (error) {
    Logger.error(requestId, "Error cleaning up jobs", { error: error.message });
    throw error;
  }
}

module.exports = {
  createDailyTimezoneJobs,
  scheduleNextDailyOccurrence,
  ensureJobsForNewTimezones,
  calculateNextOccurrenceInTimezone,
  cleanupJobsForSchedule,
  getJobId
};