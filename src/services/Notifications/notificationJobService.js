const { notificationQueue } = require("../../queues/notificationQueue");
const Logger = require("../../utils/logger");
const { createDailyTimezoneJobs, cleanupJobsForSchedule } = require('./timezoneJobService');

class NotificationJobService {

    /**
     * Schedule jobs based on schedule type
     */
    static async scheduleJobs(schedule, requestId) {
        const { scheduleType, scheduledDate } = schedule;

        if (scheduleType === "instant" || !scheduleType) {
            return await this.scheduleInstant(schedule, requestId);

        } else if (scheduleType === "scheduled_once") {
            return await this.scheduleOnce(schedule, requestId);

        } else if (scheduleType === "daily") {
            Logger.info(requestId, "Queueing DAILY timezone jobs", { scheduleId: schedule._id });
            return await createDailyTimezoneJobs(schedule._id);
        }
    }

    /**
     * Handle instant logic (Global Send)
     */
    static async scheduleInstant(schedule, requestId) {
        Logger.info(requestId, "Queueing INSTANT global job", { scheduleId: schedule._id });

        const job = await notificationQueue.add(
            "instant-send-all",
            { scheduleId: schedule._id },
            {
                removeOnComplete: true,  // Remove immediately after completion
                removeOnFail: { age: 3600 }  // Keep failures for 1 hour for debugging
            }
        );

        return { success: true, jobId: job.id };
    }

    /**
     * Handle scheduled_once logic
     */
    static async scheduleOnce(schedule, requestId) {
        const delayMs = this.calculateDelayForScheduledOnce(schedule.scheduledDate);

        if (delayMs <= 0) {
            throw new Error("Scheduled time has passed");
        }

        Logger.info(requestId, "Queueing SCHEDULED_ONCE job", { delayMs, scheduleId: schedule._id });

        const date = new Date(schedule.scheduledDate);
        const jobId = `once-${schedule._id}-${date.toISOString().replace(/[-:]/g, '').slice(0, 13)}`; // YYYYMMDDTHH

        await notificationQueue.add(
            "scheduled-once-send",
            { scheduleId: schedule._id },
            {
                delay: delayMs,
                jobId,
                removeOnComplete: true,  // Remove immediately after completion
                removeOnFail: { age: 3600 }  // Keep failures for 1 hour for debugging
            }
        );

        return { success: true };
    }

    /**
     * Calculate delay for one-time schedule
     */
    static calculateDelayForScheduledOnce(scheduledDate) {
        const now = new Date();
        const scheduled = new Date(scheduledDate);
        return scheduled.getTime() - now.getTime();
    }

    /**
     * Cleanup jobs for a schedule
     */
    static async cleanupJobs(scheduleId, requestId) {
        return await cleanupJobsForSchedule(scheduleId, requestId);
    }

    /**
     * Requeue jobs (e.g. after resume)
     */
    static async requeueJobs(schedule, requestId) {
        // Cleanup old jobs first
        await this.cleanupJobs(schedule._id, requestId);

        Logger.info(requestId, "♻️ Requeueing jobs", { scheduleId: schedule._id });

        if (schedule.scheduleType === "daily") {
            const result = await createDailyTimezoneJobs(schedule._id);
            if (result?.noRecipients) throw new Error("No users found for the selected filters");
            return result;

        } else if (schedule.scheduleType === "scheduled_once") {
            return await this.scheduleOnce(schedule, requestId);

        } else if (schedule.scheduleType === "instant") {
            // Instant notifications cannot be requeued - they're one-time immediate sends
            throw new Error("Cannot requeue instant notifications. Please create a new instant notification instead.");
        }

        // Unknown schedule type
        throw new Error(`Unknown schedule type: ${schedule.scheduleType}`);
    }
}

module.exports = NotificationJobService;
