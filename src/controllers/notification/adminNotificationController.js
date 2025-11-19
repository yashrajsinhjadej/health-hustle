// controllers/notification/adminNotificationController.js
const mongoose = require("mongoose");
const ResponseHandler = require("../../utils/ResponseHandler");
const withRequestLogging = require("../../middleware/withRequestLogging");

// Services
const NotificationScheduleService = require("../../services/Notifications/notificationScheduleService");
const NotificationJobService = require("../../services/Notifications/notificationJobService");
const NotificationQueryService = require("../../services/Notifications/notificationQueryService");

/**
 * Helper function to validate MongoDB ObjectId
 */
function validateObjectId(id, res) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ResponseHandler.error(res, "Invalid ID format", "The provided ID is not a valid MongoDB ObjectId", 400, "INVALID_ID");
    return false;
  }
  return true;
}

/**
 * 🎯 Create new notification (instant, scheduled_once, or daily)
 */
const sendNotificationToAllUsers = withRequestLogging(
  "admin-send-notification",
  async (req, res, requestId) => {
    const { title, body, scheduleType, scheduledTime, scheduledDate } = req.body;

    // ✅ Validation
    if (!title || !body) {
      return ResponseHandler.error(res, "Validation error", "Title and body are required", 400, "MISSING_FIELDS");
    }
    if (scheduleType === "daily" && !scheduledTime) {
      return ResponseHandler.error(res, "Validation error", "scheduledTime is required for daily notifications", 400, "MISSING_SCHEDULED_TIME");
    }
    if (scheduleType === "scheduled_once" && !scheduledDate) {
      return ResponseHandler.error(res, "Validation error", "scheduledDate is required for scheduled_once notifications", 400, "MISSING_SCHEDULED_DATE");
    }

    // 1. Create Schedule
    const schedule = await NotificationScheduleService.createSchedule({ ...req.body, userId: req.user?._id }, requestId);

    // 2. Schedule Jobs
    const result = await NotificationJobService.scheduleJobs(schedule, requestId);

    // 3. Handle "No Recipients" case
    if (result?.noRecipients) {
      return ResponseHandler.error(
        res,
        "No users found for the selected filters. Notification not sent.",
        { scheduleId: schedule._id, status: "no_recipients" },
        400,
        "NO_RECIPIENTS"
      );
    }

    // 4. Success Response
    const responseMessage =
      schedule.targetAudience === "filtered"
        ? `Filtered notification ${scheduleType === "instant" || !scheduleType ? "queued" : "scheduled"} successfully`
        : scheduleType === "instant" || !scheduleType
          ? "Notification queued for all users (instant send)"
          : scheduleType === "scheduled_once"
            ? "Notification scheduled successfully"
            : "Daily notification scheduled successfully";

    return ResponseHandler.success(res, responseMessage, {
      scheduleId: schedule._id,
      targetAudience: schedule.targetAudience,
      filters: schedule.filters,
      scheduleType: schedule.scheduleType,
      scheduledTime: schedule.scheduledTime,
      nextRunAt: schedule.nextRunAt,
    });
  }
);

/**
 * ⏸️▶️ Pause or Resume notification schedule
 */
const updateNotificationStatus = withRequestLogging(
  "update-notification-status",
  async (req, res, requestId) => {
    const { id } = req.params;
    const { isActive } = req.body;

    // Validate ObjectId
    if (!validateObjectId(id, res)) return;

    if (typeof isActive !== "boolean") {
      return ResponseHandler.error(res, "Invalid request", "isActive must be a boolean value", 400, "INVALID_INPUT");
    }

    const schedule = await NotificationScheduleService.getScheduleById(id);
    if (!schedule) {
      return ResponseHandler.error(res, "Not found", "Notification schedule not found", 404, "SCHEDULE_NOT_FOUND");
    }

    if (schedule.scheduleType === "instant") {
      return ResponseHandler.error(res, "Invalid operation", "Instant notifications cannot be paused or reactivated", 400, "INVALID_OPERATION");
    }

    if (schedule.isActive === isActive) {
      return ResponseHandler.success(res, `Notification is already ${isActive ? "active" : "paused"}`, {
        id: schedule._id,
        isActive: schedule.isActive,
        status: schedule.status,
      });
    }

    // Handle Pause/Resume Logic
    if (isActive === false) {
      // Pause
      await NotificationScheduleService.updateScheduleStatus(id, { isActive: false, status: "paused", pausedAt: new Date() }, requestId);
      await NotificationJobService.cleanupJobs(schedule._id, requestId);
      return ResponseHandler.success(res, "Notification paused successfully", { id: schedule._id, isActive: false, status: "paused" });

    } else {
      // Resume
      if (schedule.scheduleType === "scheduled_once") {
        const scheduledDate = new Date(schedule.scheduledDate);
        if (scheduledDate <= new Date()) {
          return ResponseHandler.error(res, "Cannot resume", "Scheduled time has already passed. Please create a new schedule.", 400, "SCHEDULE_EXPIRED");
        }
      }

      const newStatus = schedule.scheduleType === "daily" ? "active" : "pending";
      await NotificationScheduleService.updateScheduleStatus(id, { isActive: true, status: newStatus, reactivatedAt: new Date(), pausedAt: null }, requestId);

      try {
        await NotificationJobService.requeueJobs(schedule, requestId);
      } catch (err) {
        if (err.message === "No users found for the selected filters") {
          // If requeue fails due to no users, we might want to revert status or just warn. 
          // For now, let's propagate error or handle it. 
          // The original code threw error. Let's let the wrapper catch it or handle specific error.
          // Actually, if requeue fails, we should probably tell user.
          throw err;
        }
        throw err;
      }

      return ResponseHandler.success(res, "Notification resumed successfully", { id: schedule._id, isActive: true, status: newStatus });
    }
  }
);

/**
 * 🗑️ Delete notification schedule
 */
const deleteNotificationSchedule = withRequestLogging(
  "delete-notification",
  async (req, res, requestId) => {
    const { id } = req.params;

    // Validate ObjectId
    if (!validateObjectId(id, res)) return;

    const schedule = await NotificationScheduleService.getScheduleById(id);
    if (!schedule) {
      return ResponseHandler.error(res, "Not found", "Notification schedule not found", 404, "SCHEDULE_NOT_FOUND");
    }

    await NotificationJobService.cleanupJobs(schedule._id, requestId);
    await NotificationScheduleService.deleteSchedule(id);

    return ResponseHandler.success(res, "Notification schedule deleted successfully", { id: schedule._id });
  }
);

/**
 * 📊 Get notification history with filters
 */
const getNotificationHistory = withRequestLogging(
  "get-notification-history",
  async (req, res, requestId) => {
    const result = await NotificationQueryService.getNotificationHistory(req.query);

    // Format response
    const formattedNotifications = result.notifications.map(notif => ({
      id: notif._id,
      title: notif.scheduleId?.title || 'N/A',
      content: notif.scheduleId?.message || 'N/A',
      type: notif.scheduleId?.scheduleType || 'daily',
      date: notif.firedAt ? new Date(notif.firedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A',
      time: notif.firedAt ? new Date(notif.firedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A',
      status: notif.status,
      totalTargeted: notif.totalTargeted,
      successCount: notif.successCount,
      failureCount: notif.failureCount,
      successRate: notif.totalTargeted > 0 ? ((notif.successCount / notif.totalTargeted) * 100).toFixed(2) + '%' : '0%',
      errorMessage: notif.errorMessage || null,
      firedAt: notif.firedAt,
      scheduleId: notif.scheduleId?._id || null
    }));

    const totalPages = Math.ceil(result.totalCount / result.limit);

    return ResponseHandler.success(res, "Notification history fetched successfully", {
      notifications: formattedNotifications,
      pagination: {
        currentPage: result.page,
        totalPages,
        totalItems: result.totalCount,
        itemsPerPage: result.limit,
        hasNextPage: result.page < totalPages,
        hasPrevPage: result.page > 1,
        nextPage: result.page < totalPages ? result.page + 1 : null,
        prevPage: result.page > 1 ? result.page - 1 : null
      },
      filters: req.query
    });
  }
);

/**
 * 📈 Get notification statistics
 */
const getNotificationStats = withRequestLogging(
  "get-notification-stats",
  async (req, res, requestId) => {
    const stats = await NotificationQueryService.getNotificationStats(req.query);

    const successRate = stats.totalTargeted > 0
      ? ((stats.totalSuccess / stats.totalTargeted) * 100).toFixed(2)
      : 0;

    return ResponseHandler.success(res, "Notification stats fetched successfully", {
      ...stats,
      successRate: `${successRate}%`
    });
  }
);

/**
 * 📋 Get scheduled notifications (active, paused, pending)
 */
const getScheduledNotifications = withRequestLogging(
  "get-scheduled-notifications",
  async (req, res, requestId) => {
    const result = await NotificationQueryService.getScheduledNotifications(req.query);

    const formatHHmmUTC = (dateVal) => {
      if (!dateVal) return null;
      const d = new Date(dateVal);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    };

    const formattedSchedules = result.schedules.map(schedule => {
      const derivedScheduledTime = formatHHmmUTC(schedule.scheduledDate);
      const scheduledTimeOut = schedule.scheduledTime || derivedScheduledTime || null;

      return {
        id: schedule._id,
        title: schedule.title || 'N/A',
        message: schedule.message || 'N/A',
        scheduleType: schedule.scheduleType,
        scheduledDate: schedule.scheduledDate || null,
        scheduledTime: scheduledTimeOut,
        targetAudience: schedule.targetAudience || 'all',
        filters: schedule.filters || {},
        status: schedule.status,
        isActive: schedule.isActive,
        createdBy: {
          id: schedule.createdBy?._id,
          name: schedule.createdBy?.name || 'Unknown',
          email: schedule.createdBy?.email || 'N/A'
        },
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
        lastRunStatus: schedule.lastRunStatus,
      };
    });

    const totalPages = Math.ceil(result.totalCount / result.limit);

    return ResponseHandler.success(res, "Scheduled notifications fetched successfully", {
      schedules: formattedSchedules,
      pagination: {
        currentPage: result.page,
        totalPages,
        totalItems: result.totalCount,
        itemsPerPage: result.limit,
        hasNextPage: result.page < totalPages,
        hasPrevPage: result.page > 1,
        nextPage: result.page < totalPages ? result.page + 1 : null,
        prevPage: result.page > 1 ? result.page - 1 : null
      },
      filters: req.query
    });
  }
);

module.exports = {
  sendNotificationToAllUsers,
  updateNotificationStatus,
  deleteNotificationSchedule,
  getNotificationHistory,
  getNotificationStats,
  getScheduledNotifications,
};