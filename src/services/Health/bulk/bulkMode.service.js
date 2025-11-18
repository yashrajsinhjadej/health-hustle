// services/Health/bulk/bulkMode.service.js

const Logger = require('../../../utils/logger');
const DailyHealthRepository = require('../../../repositories/DailyHealthRepository');

async function bulkModeService({
    sortedData,
    allDates,
    userId,
    timezone,
    requestId
}) {
    Logger.info("BULK MODE: Processing without streak calculation", requestId, {
        totalRecords: sortedData.length
    });

    // -----------------------------
    // 1. Fetch existing records
    // -----------------------------
    const existingRecords = await DailyHealthRepository.findByUserAndDates(
        userId,
        allDates
    );

    const recordMap = {};
    existingRecords.forEach(r => (recordMap[r.date] = r));

    const bulkOps = [];
    const results = [];

    // -----------------------------
    // 2. Process each incoming date
    // -----------------------------
    for (const { date, data } of sortedData) {
        try {
            const existing = recordMap[date];

            const setDoc = { userId, date };

            // Steps
            if (data.steps?.count !== undefined)
                setDoc["steps.count"] = data.steps.count;

            // Heart Rate
            if (data.heartRate?.avgBpm !== undefined)
                setDoc["heartRate.avgBpm"] = data.heartRate.avgBpm;

            // Sleep
            if (data.sleep?.duration !== undefined)
                setDoc["sleep.duration"] = data.sleep.duration;

            // Calories (burned only)
            if (data.calories?.burned !== undefined)
                setDoc["calories.burned"] = data.calories.burned;

            // Water (exclude *consumed*)
            if (data.water) {
                Object.keys(data.water).forEach(key => {
                    if (key !== "consumed") {
                        setDoc[`water.${key}`] = data.water[key];
                    }
                });
            }

            // Defaults only if inserting a new entry
            const setOnInsertDoc = {
                "calories.consumed": 0,
                "calories.entries": [],
                "water.consumed": 0,
                "water.entries": []
            };

            if (setDoc["calories.burned"] === undefined) {
                setOnInsertDoc["calories.burned"] = 0;
            }

            bulkOps.push({
                updateOne: {
                    filter: { userId, date },
                    update: { $set: setDoc, $setOnInsert: setOnInsertDoc },
                    upsert: true
                }
            });

            results.push({
                date,
                mode: "bulk",
                status: existing ? "updated" : "created"
            });

        } catch (err) {
            Logger.error("Error processing date in BULK MODE", requestId, {
                date,
                error: err.message
            });
        }
    }

    // -----------------------------
    // 3. Bulk Write Operation
    // -----------------------------
    if (bulkOps.length > 0) {
        await DailyHealthRepository.bulkWrite(bulkOps);
    }

    // NO TODAY DATA IN BULK MODE
    return { results };
}

module.exports = bulkModeService;
