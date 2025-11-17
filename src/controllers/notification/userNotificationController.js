const NotificationLog = require('../../models/NotificationLog');
const ResponseHandler = require('../../utils/ResponseHandler');
const Logger = require('../../utils/logger');

class UserNotificationController {
    async getNotificationFeed(req, res) {
        const requestId = Logger.generateId('user-notification-feed');

        try {
            const userId = req.user?._id;
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 20;
            const skip = (page - 1) * limit;

            Logger.info(requestId, 'Fetching user notification feed', {
                userId,
                page,
                limit
            });

            const filter = { userId };

            const [logs, totalItems] = await Promise.all([
                NotificationLog.find(filter)
                    .sort({ sentAt: -1, createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .select('_id title message category sentAt createdAt')
                    .lean(),
                NotificationLog.countDocuments(filter)
            ]);
            console.log(logs)
                const notifications = logs.map((log) => ({
                id: log._id,
                title: log.title,
                message: log.message,
                sentAt: log.sentAt || log.createdAt,
                category: log.category || null
            }));

            const totalPages = limit > 0 ? Math.ceil(totalItems / limit) : 0;

            Logger.success(requestId, 'User notification feed fetched', {
                userId,
                totalItems,
                page,
                totalPages
            });

            return ResponseHandler.success(res, 'Notifications fetched successfully', {
                notifications,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalItems,
                    itemsPerPage: limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                    nextPage: page < totalPages ? page + 1 : null,
                    prevPage: page > 1 ? page - 1 : null
                }
            });
        } catch (error) {
            Logger.error(requestId, 'Failed to fetch user notification feed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?._id
            });

            return ResponseHandler.serverError(res, 'Failed to fetch notifications');
        }
    }
}

module.exports = new UserNotificationController();

