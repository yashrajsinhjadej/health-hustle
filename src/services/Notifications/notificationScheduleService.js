const NotificationSchedule = require("../../models/NotificationSchedule");
const Logger = require("../../utils/logger");
const { calculateNextOccurrenceInTimezone } = require('./timezoneJobService');

class NotificationScheduleService {

    /**
     * Create a new notification schedule
     */
    static async createSchedule(data, requestId) {
        Logger.debug(requestId, "Creating notification schedule in MongoDB", data);

        const scheduleData = {
            title: data.title,
            message: data.body,
            scheduleType: data.scheduleType || "instant",
            scheduledTime: data.scheduleType === "daily" ? data.scheduledTime : undefined,
            scheduledDate: data.scheduleType === "scheduled_once" ? data.scheduledDate : undefined,
            targetAudience: data.targetAudience || "all",
            filters: data.targetAudience === "filtered" ? data.filters : {},
            category: data.category || null,
            createdBy: data.userId || null,
            status: "pending",
            isActive: true,
        };

        // Calculate nextRunAt for daily schedules
        if (data.scheduleType === "daily") {
            scheduleData.status = "active";
            scheduleData.nextRunAt = calculateNextOccurrenceInTimezone(data.scheduledTime, "UTC");
        }

        const schedule = await NotificationSchedule.create(scheduleData);

        Logger.success(requestId, "NotificationSchedule created", {
            scheduleId: schedule._id,
            scheduleType: schedule.scheduleType,
        });

        return schedule;
    }

    /**
     * Find schedule by ID
     */
    static async getScheduleById(id) {
        return await NotificationSchedule.findById(id);
    }

    /**
     * Update schedule status (pause/resume)
     */
    static async updateScheduleStatus(id, statusData, requestId) {
        const update = {
            ...statusData,
            updatedAt: new Date()
        };

        const schedule = await NotificationSchedule.findByIdAndUpdate(id, update, { new: true });
        Logger.info(requestId, "Schedule status updated", { id, status: schedule.status, isActive: schedule.isActive });
        return schedule;
    }

    /**
     * Delete schedule
     */
    static async deleteSchedule(id) {
        return await NotificationSchedule.findByIdAndDelete(id);
    }
}

module.exports = NotificationScheduleService;
