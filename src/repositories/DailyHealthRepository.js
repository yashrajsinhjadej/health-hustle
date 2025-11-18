// src/repositories/DailyHealthRepository.js
const DailyHealthData = require('../models/DailyHealthData');

class DailyHealthRepository {

    // Get records for multiple dates
    static async findByUserAndDates(userId, dates) {
        return DailyHealthData.find({
            userId,
            date: { $in: dates }
        }).lean();
    }

    // Get record by single date
    static async findByUserAndDate(userId, date) {
        return DailyHealthData.findOne({ userId, date }).lean();
    }

    // Get previous day's record
    static async findPreviousRecord(userId, previousDate) {
        return DailyHealthData.findOne({
            userId,
            date: previousDate
        }).lean();
    }

    // Bulk write operations
    static async bulkWrite(operations) {
        return DailyHealthData.bulkWrite(operations);
    }

    // Raw model access (if needed)
    static model() {
        return DailyHealthData;
    }
}

module.exports = DailyHealthRepository;
