const NotificationHistory = require("../../models/NotificationHistory");
const NotificationSchedule = require("../../models/NotificationSchedule");

class NotificationQueryService {

    /**
     * Get notification history with filters and pagination
     */
    static async getNotificationHistory(query) {
        const {
            page = 1,
            limit = 10,
            status,
            sortBy = 'firedAt',
            order = 'desc',
            startDate,
            endDate,
            search
        } = query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build match stage for filters
        const matchStage = {};

        if (status && ['sent', 'partial_success', 'failed'].includes(status)) {
            matchStage.status = status;
        }

        if (startDate || endDate) {
            matchStage.firedAt = {};
            if (startDate) matchStage.firedAt.$gte = new Date(startDate);
            if (endDate) matchStage.firedAt.$lte = new Date(endDate);
        }

        const sortOrder = order === 'asc' ? 1 : -1;

        // Use aggregation pipeline for server-side search
        const pipeline = [
            { $match: matchStage },
            {
                $lookup: {
                    from: 'notificationschedules',
                    localField: 'scheduleId',
                    foreignField: '_id',
                    as: 'schedule'
                }
            },
            { $unwind: { path: '$schedule', preserveNullAndEmptyArrays: true } },

            // Apply search filter server-side if provided
            ...(search && search.trim() !== '' ? [{
                $match: {
                    $or: [
                        { 'schedule.title': new RegExp(search.trim(), 'i') },
                        { 'schedule.message': new RegExp(search.trim(), 'i') }
                    ]
                }
            }] : []),

            { $sort: { [sortBy]: sortOrder } },

            // Use $facet to get both data and count in one query
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limitNum },
                        {
                            $project: {
                                _id: 1,
                                scheduleId: '$schedule._id',
                                firedAt: 1,
                                totalTargeted: 1,
                                successCount: 1,
                                failureCount: 1,
                                status: 1,
                                errorMessage: 1,
                                createdAt: 1,
                                'schedule.title': 1,
                                'schedule.message': 1,
                                'schedule.frequency': 1,
                                'schedule.status': 1,
                                'schedule.scheduledTime': 1,
                                'schedule.scheduleType': 1
                            }
                        }
                    ],
                    totalCount: [{ $count: 'count' }]
                }
            }
        ];

        const result = await NotificationHistory.aggregate(pipeline);

        // Reshape the data to match expected format
        const notifications = result[0].data.map(item => ({
            _id: item._id,
            firedAt: item.firedAt,
            totalTargeted: item.totalTargeted,
            successCount: item.successCount,
            failureCount: item.failureCount,
            status: item.status,
            errorMessage: item.errorMessage,
            createdAt: item.createdAt,
            scheduleId: item.schedule ? {
                _id: item.scheduleId,
                title: item.schedule.title,
                message: item.schedule.message,
                frequency: item.schedule.frequency,
                status: item.schedule.status,
                scheduledTime: item.schedule.scheduledTime,
                scheduleType: item.schedule.scheduleType
            } : null
        }));

        const totalCount = result[0].totalCount[0]?.count || 0;

        return {
            notifications,
            totalCount,
            page: pageNum,
            limit: limitNum
        };
    }

    /**
     * Get notification stats
     */
    static async getNotificationStats(query) {
        const { startDate, endDate } = query;

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

        return stats[0] || {
            totalNotifications: 0,
            totalTargeted: 0,
            totalSuccess: 0,
            totalFailures: 0,
            sentCount: 0,
            partialSuccessCount: 0,
            failedCount: 0
        };
    }

    /**
     * Get scheduled notifications
     */
    static async getScheduledNotifications(query) {
        const {
            page = 1,
            limit = 10,
            status,
            scheduleType,
            sortBy = 'createdAt',
            order = 'desc',
            search
        } = query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const now = new Date();

        const filter = {
            scheduleType: { $ne: 'instant' },
            status: { $in: ['active', 'paused', 'pending'] }
        };

        if (scheduleType) {
            if (scheduleType === 'daily') filter.scheduleType = 'daily';
            else if (scheduleType === 'scheduled_once') filter.scheduleType = 'scheduled_once';
        }

        if (status && ['active', 'paused', 'pending'].includes(status)) {
            filter.status = status;
        }

        if (search && search.trim() !== '') {
            const searchRegex = new RegExp(search.trim(), 'i');
            filter.$or = [
                { title: searchRegex },
                { message: searchRegex }
            ];
        }

        // Exclude paused one-time schedules whose scheduledDate is already in the past
        filter.$nor = [
            {
                scheduleType: 'scheduled_once',
                status: 'paused',
                scheduledDate: { $lt: now }
            }
        ];

        const sortOrder = order === 'asc' ? 1 : -1;
        const sort = { [sortBy]: sortOrder };

        const [schedules, totalCount] = await Promise.all([
            NotificationSchedule.find(filter)
                .populate('createdBy', 'name email')
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            NotificationSchedule.countDocuments(filter)
        ]);

        return {
            schedules,
            totalCount,
            page: pageNum,
            limit: limitNum
        };
    }
}

module.exports = NotificationQueryService;
