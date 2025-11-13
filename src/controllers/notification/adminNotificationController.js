// controllers/notification/adminNotificationController.js
const NotificationSchedule = require("../../models/NotificationSchedule");
const { notificationQueue } = require("../../queues/notificationQueue");
const Logger = require("../../utils/logger");
const ResponseHandler = require("../../utils/ResponseHandler");
const Redis = require("ioredis");
const NotificationHistory = require("../../models/NotificationHistory");
const NotificationLog = require("../../models/NotificationLog");


async function updateNotificationStatus(req, res) {
  const requestId = Logger.generateId("update-notification-status");

  try {
    const { id } = req.params;
    const { isActive } = req.body;

    Logger.info(requestId, "📝 Updating notification status", { id, isActive });

    // Validate request
    if (typeof isActive !== "boolean") {
      return ResponseHandler.error(
        res,
        "Invalid request",
        "isActive must be a boolean value",
        400,
        "INVALID_INPUT"
      );
    }

    // Step 1: Fetch schedule
    const schedule = await NotificationSchedule.findById(id);
    if (!schedule) {
      Logger.warn(requestId, "Schedule not found", { id });
      return ResponseHandler.error(
        res,
        "Not found",
        "Notification schedule not found",
        404,
        "SCHEDULE_NOT_FOUND"
      );
    }

    // Step 2: Validate operation
    if (schedule.scheduleType === "instant") {
      Logger.warn(requestId, "Cannot pause/resume instant notification", { id });
      return ResponseHandler.error(
        res,
        "Invalid operation",
        "Instant notifications cannot be paused or reactivated",
        400,
        "INVALID_OPERATION"
      );
    }

    // Check if already in requested state
    if (schedule.isActive === isActive) {
      Logger.info(requestId, "Schedule already in requested state", {
        id,
        isActive,
      });
      return ResponseHandler.success(
        res,
        `Notification is already ${isActive ? "active" : "paused"}`,
        {
          id: schedule._id,
          isActive: schedule.isActive,
          status: schedule.status,
        }
      );
    }

    // Step 3: Handle PAUSE (isActive = false)
    if (isActive === false) {
      Logger.info(requestId, "⏸️ Pausing notification", { id });

      // Update MongoDB
      await NotificationSchedule.findByIdAndUpdate(id, {
        isActive: false,
        status: "paused",
        pausedAt: new Date(),
      });

      // Clean up Redis jobs
      await cleanupRedisJobs(schedule._id, requestId);

      Logger.success(requestId, "Notification paused successfully", { id });

      return ResponseHandler.success(res, "Notification paused successfully", {
        id: schedule._id,
        isActive: false,
        status: "paused",
      });
    }

    // Step 4: Handle RESUME (isActive = true)
    if (isActive === true) {
      Logger.info(requestId, "▶️ Resuming notification", { id });

      // Check if scheduled_once is still valid
      if (schedule.scheduleType === "scheduled_once") {
        const scheduledDate = new Date(schedule.scheduledDate);
        const now = new Date();

        if (scheduledDate <= now) {
          Logger.warn(requestId, "Cannot resume: scheduled time has passed", {
            id,
            scheduledDate,
          });
          return ResponseHandler.error(
            res,
            "Cannot resume",
            "Scheduled time has already passed. Please create a new schedule.",
            400,
            "SCHEDULE_EXPIRED"
          );
        }
      }

      // Update MongoDB
      await NotificationSchedule.findByIdAndUpdate(id, {
        isActive: true,
        status: schedule.scheduleType === "daily" ? "active" : "pending",
        reactivatedAt: new Date(),
        pausedAt: null,
      });

      // Requeue jobs
      await requeueJobs(schedule, requestId);

      Logger.success(requestId, "Notification resumed successfully", { id });

      return ResponseHandler.success(res, "Notification resumed successfully", {
        id: schedule._id,
        isActive: true,
        status: schedule.scheduleType === "daily" ? "active" : "pending",
      });
    }
  } catch (error) {
    Logger.error(requestId, "Error updating notification status", {
      error: error.message,
      stack: error.stack,
    });
    return ResponseHandler.serverError(res, "Failed to update notification status");
  }
}
async function cleanupRedisJobs(scheduleId, requestId) {
  try {
    const redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    Logger.info(requestId, "🧹 Cleaning up Redis jobs", { scheduleId });

    // Get all jobs from the queue
    const queue = notificationQueue;
    const jobs = await queue.getJobs([
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
        Logger.debug(requestId, "Removed job from Redis", {
          jobId: job.id,
          jobName: job.name,
        });
      }
    }

    await redis.quit();

    Logger.success(requestId, "Redis cleanup complete", {
      scheduleId,
      removedCount,
    });
  } catch (error) {
    Logger.error(requestId, "Error cleaning up Redis jobs", {
      error: error.message,
    });
    throw error;
  }
}

async function requeueJobs(schedule, requestId) {
  try {
    await cleanupRedisJobs(schedule._id, requestId);

    Logger.info(requestId, "♻️ Requeueing jobs", {
      scheduleId: schedule._id,
      scheduleType: schedule.scheduleType,
    });

    if (schedule.scheduleType === "daily") {
      // Requeue timezone jobs for daily schedule
      await queueTimezoneJobs(schedule._id, "daily");
      Logger.success(requestId, "Daily timezone jobs requeued", {
        scheduleId: schedule._id,
      });
    } else if (schedule.scheduleType === "scheduled_once") {
      // Requeue single delayed job
      const delayMs = calculateDelayForScheduledOnce(schedule.scheduledDate);

      await notificationQueue.add(
        "scheduled-once-send",
        { scheduleId: schedule._id },
        {
          delay: delayMs,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 3600 },
        }
      );

      Logger.success(requestId, "Scheduled once job requeued", {
        scheduleId: schedule._id,
        delayMs,
      });
    }
  } catch (error) {
    Logger.error(requestId, "Error requeueing jobs", { error: error.message });
    throw error;
  }
}

async function sendNotificationToAllUsers(req, res) {
  const requestId = Logger.generateId("admin-send-notification");

  try {
    Logger.info(requestId, "📢 Starting sendNotificationToAllUsers");
    Logger.logRequest(requestId, req);

    const { title, body, scheduleType, scheduledTime, scheduledDate } = req.body;

    // --- Step 1: Create schedule document ---
    Logger.debug(requestId, "Creating notification schedule in MongoDB", {
      scheduleType,
      scheduledTime,
      scheduledDate,
    });

    const scheduleData = {
      title,
      message: body,
      scheduleType: scheduleType || "instant",
      scheduledTime: scheduleType === "daily" ? scheduledTime : undefined,
      scheduledDate: scheduleType === "scheduled_once" ? scheduledDate : undefined,
      targetAudience: "all",
      filters: {},
      createdBy: req.user?._id || null,
      status: "pending",
    };

    // Calculate nextRunAt for daily schedules
    if (scheduleType === "daily") {
      scheduleData.status = "active"; // Daily starts as active
      scheduleData.nextRunAt = calculateNextOccurrenceInTimezone(scheduledTime, "UTC");
    }

    const schedule = await NotificationSchedule.create(scheduleData);

    Logger.success(requestId, "NotificationSchedule created", {
      scheduleId: schedule._id,
      scheduleType,
    });

    // --- Step 2: Queue based on scheduleType ---
    if (scheduleType === "instant" || !scheduleType) {
      Logger.info(requestId, "Queuing INSTANT job (timezone-aware)", {
        scheduleId: schedule._id,
      });
      await queueTimezoneJobs(schedule._id, "instant");

    } else if (scheduleType === "scheduled_once") {
      const delayMs = calculateDelayForScheduledOnce(scheduledDate);
      if (delayMs <= 0) {
        Logger.warn(requestId, "Invalid scheduledDate — time is in the past", { scheduledDate });
        return ResponseHandler.error(
          res,
          "Invalid scheduled date",
          "Scheduled date must be in the future",
          400,
          "INVALID_SCHEDULE_DATE"
        );
      }

      Logger.info(requestId, "Queuing SCHEDULED_ONCE job", { delayMs, scheduleId: schedule._id });
      await notificationQueue.add(
        "scheduled-once-send",
        { scheduleId: schedule._id },
        {
          delay: delayMs,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 3600 },
        }
      );

    } else if (scheduleType === "daily") {
      Logger.info(requestId, "Queuing DAILY timezone jobs", { scheduleId: schedule._id });
      await queueTimezoneJobs(schedule._id, "daily");
    }

    // --- Step 3: Response ---
    Logger.success(requestId, "Notification scheduling complete", {
      scheduleId: schedule._id,
      scheduleType,
    });

    return ResponseHandler.success(
      res,
      scheduleType === "instant" || !scheduleType
        ? "Notification queued for all users (instant send)"
        : scheduleType === "scheduled_once"
        ? "Notification scheduled successfully"
        : "Daily notification scheduled successfully",
      { scheduleId: schedule._id }
    );
  } catch (error) {
    Logger.error(requestId, "Error in sendNotificationToAllUsers", {
      error: error.message,
      stack: error.stack,
    });
    return ResponseHandler.serverError(res, "Failed to schedule notification");
  }
}

async function queueTimezoneJobs(scheduleId, scheduleType) {
  const User = require("../../models/User");
  const requestId = Logger.generateId("queue-timezone");

  Logger.info(requestId, "Queueing timezone jobs", { scheduleId, scheduleType });

  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    Logger.error(requestId, "Schedule not found", { scheduleId });
    throw new Error("Schedule not found");
  }

  const timezones = await User.distinct("timezone", {
    "fcmToken.token": { $exists: true, $ne: null, $ne: "" },
    $or: [
      { notificationsEnabled: true },
      { notificationsEnabled: { $exists: false } },
    ],
  });

  Logger.debug(requestId, "Fetched distinct timezones", { count: timezones.length });

  for (const timezone of timezones) {
    let utcFireTime;

    if (scheduleType === "instant") {
      utcFireTime = new Date();
    } else if (scheduleType === "daily") {
      utcFireTime = calculateNextOccurrenceInTimezone(schedule.scheduledTime, timezone);
    }

    const delayMs = Math.max(utcFireTime.getTime() - Date.now(), 0);

    Logger.debug(requestId, "Queueing job for timezone", {
      timezone,
      fireTime: utcFireTime.toISOString(),
      delayMs,
    });

    await notificationQueue.add(
      `${scheduleType}-timezone-send`,
      { scheduleId: schedule._id, timezone },
      { delay: delayMs }
    );
  }

  Logger.success(requestId, "All timezone jobs queued", {
    scheduleId,
    scheduleType,
    timezoneCount: timezones.length,
  });
}

function calculateNextOccurrenceInTimezone(scheduledTime, timezone) {
  const moment = require("moment-timezone");
  const [hours, minutes] = scheduledTime.split(":").map(Number);

  const nowInTz = moment.tz(timezone);
  const fireTimeInTz = nowInTz
    .clone()
    .hours(hours)
    .minutes(minutes)
    .seconds(0)
    .milliseconds(0);

  if (fireTimeInTz.isSameOrBefore(nowInTz)) {
    fireTimeInTz.add(1, "day");
  }

  return fireTimeInTz.utc().toDate();
}

function calculateDelayForScheduledOnce(scheduledDate) {
  return Math.max(new Date(scheduledDate).getTime() - Date.now(), 0);
}

async function sendNotificationToUser(req, res) {
  const requestId = Logger.generateId("admin-send-single-notification");
  Logger.warn(requestId, "Single user notification endpoint not implemented");
  return ResponseHandler.error(
    res,
    "Not implemented",
    "Use FCMService for single-user send",
    400,
    "NOT_IMPLEMENTED"
  );
}

const getNotificationHistory = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'firedAt',
      order = 'desc',
      startDate,
      endDate,
      search
    } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter = {};

    // Status filter
    if (status && ['sent', 'partial_success', 'failed'].includes(status)) {
      filter.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.firedAt = {};
      if (startDate) {
        filter.firedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.firedAt.$lte = new Date(endDate);
      }
    }

    // Build sort object
    const sortOrder = order === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // Execute query with pagination
    const [notifications, totalCount] = await Promise.all([
      NotificationHistory.find(filter)
        .populate({
          path: 'scheduleId',
          select: 'title message frequency status scheduledTime scheduleType'
        })
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      NotificationHistory.countDocuments(filter)
    ]);

    // If search is provided, filter results by schedule title or message
    let filteredNotifications = notifications;
    let filteredCount = totalCount;

    if (search && search.trim() !== '') {
      const searchLower = search.toLowerCase();
      filteredNotifications = notifications.filter(notif => {
        if (!notif.scheduleId) return false;
        const titleMatch = notif.scheduleId.title?.toLowerCase().includes(searchLower);
        const messageMatch = notif.scheduleId.message?.toLowerCase().includes(searchLower);
        return titleMatch || messageMatch;
      });
      filteredCount = filteredNotifications.length;
    }
    console.log(filteredNotifications)
    // Format response data
    const formattedNotifications = filteredNotifications.map(notif => ({
      id: notif._id,
      title: notif.scheduleId?.title || 'N/A',
      content: notif.scheduleId?.message || 'N/A',
      type: notif.scheduleId?.scheduleType || 'daily',
      date: notif.firedAt ? new Date(notif.firedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }) : 'N/A',
      time: notif.firedAt ? new Date(notif.firedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }) : 'N/A',
      status: notif.status,
      totalTargeted: notif.totalTargeted,
      successCount: notif.successCount,
      failureCount: notif.failureCount,
      successRate: notif.totalTargeted > 0 
        ? ((notif.successCount / notif.totalTargeted) * 100).toFixed(2) + '%'
        : '0%',
      errorMessage: notif.errorMessage || null,
      firedAt: notif.firedAt,
      scheduleId: notif.scheduleId?._id || null
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(filteredCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // Send response
    return res.status(200).json({
      success: true,
      data: {
        notifications: formattedNotifications,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: filteredCount,
          itemsPerPage: limitNum,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? pageNum + 1 : null,
          prevPage: hasPrevPage ? pageNum - 1 : null
        },
        filters: {
          status: status || 'all',
          sortBy,
          order,
          startDate: startDate || null,
          endDate: endDate || null,
          search: search || null
        }
      }
    });

  } catch (error) {
    console.error('Error fetching notification history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notification history',
      error: error.message
    });
  }
};


/**
 * Get notification statistics
 * @route GET /api/notifications/history/stats
 * @query {string} startDate - Start date for stats
 * @query {string} endDate - End date for stats
 */
const getNotificationStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {};
    if (startDate || endDate) {
      filter.firedAt = {};
      if (startDate) filter.firedAt.$gte = new Date(startDate);
      if (endDate) filter.firedAt.$lte = new Date(endDate);
    }

    const stats = await NotificationHistory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalNotifications: { $sum: 1 },
          totalTargeted: { $sum: '$totalTargeted' },
          totalSuccess: { $sum: '$successCount' },
          totalFailures: { $sum: '$failureCount' },
          sentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
          },
          partialSuccessCount: {
            $sum: { $cond: [{ $eq: ['$status', 'partial_success'] }, 1, 0] }
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalNotifications: 0,
      totalTargeted: 0,
      totalSuccess: 0,
      totalFailures: 0,
      sentCount: 0,
      partialSuccessCount: 0,
      failedCount: 0
    };

    const successRate = result.totalTargeted > 0
      ? ((result.totalSuccess / result.totalTargeted) * 100).toFixed(2)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        successRate: `${successRate}%`
      }
    });

  } catch (error) {
    console.error('Error fetching notification stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics',
      error: error.message
    });
  }
};

const getScheduledNotifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      scheduleType,
      sortBy = 'createdAt',
      order = 'desc',
      search
    } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build base filter object - exclude instant notifications
    const filter = {
      scheduleType: { $ne: 'instant' },
      status: { $in: ['active', 'paused', 'pending'] } // Only show these 3 statuses
    };

    // Handle schedule type filter
    if (scheduleType) {
      if (scheduleType === 'daily') {
        filter.scheduleType = 'daily';
      } else if (scheduleType === 'scheduled_once') {
        filter.scheduleType = 'scheduled_once';
      }
    }

    // Handle status filter
    if (status && ['active', 'paused', 'pending'].includes(status)) {
      filter.status = status;
    }

    // Search filter
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { title: searchRegex },
        { message: searchRegex }
      ];
    }

    // Build sort object
    const sortOrder = order === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // Execute query with pagination
    const [schedules, totalCount] = await Promise.all([
      NotificationSchedule.find(filter)
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      NotificationSchedule.countDocuments(filter)
    ]);

    // Format response data
    const formattedSchedules = schedules.map(schedule => ({
      id: schedule._id,
      title: schedule.title || 'N/A',
      message: schedule.message || 'N/A',
      scheduleType: schedule.scheduleType,
      scheduledTime: schedule.scheduledTime || null,
      scheduledDate: schedule.scheduledDate || null,
      targetAudience: schedule.targetAudience || 'all',
      status: schedule.status,
      isActive: schedule.isActive,
      createdBy: {
        id: schedule.createdBy?._id,
        name: schedule.createdBy?.name || 'Unknown',
        email: schedule.createdBy?.email || 'N/A'
      },
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // Send response
    return res.status(200).json({
      success: true,
      data: {
        schedules: formattedSchedules,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limitNum,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? pageNum + 1 : null,
          prevPage: hasPrevPage ? pageNum - 1 : null
        },
        filters: {
          status: status || 'all',
          scheduleType: scheduleType || 'all',
          sortBy,
          order,
          search: search || null
        }
      }
    });

  } catch (error) {
    console.error('Error fetching scheduled notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch scheduled notifications',
      error: error.message
    });
  }
};
module.exports = {
  sendNotificationToAllUsers,
  sendNotificationToUser,
  updateNotificationStatus,
  getNotificationHistory, 
  getNotificationStats,
  getScheduledNotifications
};