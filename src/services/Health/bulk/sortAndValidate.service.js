// src/services/Health/bulk/sortAndValidate.service.js
const timeZoneUtil = require("../../../utils/timeZone");
const Logger = require("../../../utils/logger");

module.exports = function sortAndValidate(healthData, timezone, requestId) {
    const today = timeZoneUtil.getCurrentDateInTimezone(timezone || "UTC");

    // Filter future dates + sort ascending
    const sorted = [...healthData]
        .filter(item => item.date <= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sorted.length === 0) {
        return {
            error: true,
            message: "No valid data to process"
        };
    }

    const allDates = sorted.map(d => d.date);
    const firstDate = sorted[0].date;

    const isStreakMode = sorted.length <= 2;
    const isBulkMode   = sorted.length > 2;

    Logger.info("Bulk update mode determined", requestId, {
        mode: isStreakMode ? "STREAK" : "BULK",
        totalRecords: sorted.length,
        dateRange: `${sorted[0].date} → ${sorted[sorted.length - 1].date}`
    });

    return {
        error: false,
        sortedData: sorted,
        allDates,
        firstDate,
        today,
        isStreakMode,
        isBulkMode
    };
};
