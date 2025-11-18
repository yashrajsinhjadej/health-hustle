// services/Health/common/addSleep.service.js
const DailyHealthData = require('../../../models/DailyHealthData');
const Goals = require('../../../models/Goals');
const Logger = require('../../../utils/logger');
const todayDataService = require('./todayData.service');

module.exports = async ({ userId, sleepDuration, timezone, requestId }) => {
    
    // 1️⃣ UPDATE TODAY'S SLEEP
    const todayHealth = await updateTodaySleep(userId, sleepDuration, timezone, requestId);

    // 2️⃣ FETCH USER GOALS
    const userGoals = await fetchUserGoals(userId, timezone, requestId);

    // 3️⃣ BUILD 7-DAY HISTORY
    const sleepHistory = await buildSleepHistory(userId, timezone, requestId);

    // 4️⃣ BUILD RESPONSE
    const result = {
        goalcompletions: todayHealth?.goalcomplete || false,
        streak: todayHealth?.streak || 0,
        goals: formatGoals(userGoals),
        last7Days: sleepHistory
    };

    Logger.info("Add sleep SUCCESS", requestId);
    return result;
};

/**
 * Update or create today's sleep record
 */
async function updateTodaySleep(userId, sleepDuration, timezone, requestId) {
    const timeZoneUtil = require('../../../utils/timeZone');
    const todayDate = timeZoneUtil.getCurrentDateInTimezone(timezone);

    let todayHealth = await DailyHealthData.findOne({ userId, date: todayDate });

    const entry = {
        duration: sleepDuration,
        at: new Date().toISOString()
    };

    if (todayHealth) {
        // Update existing record
        const currentDuration = todayHealth.sleep?.duration || 0;

        // Validate 12-hour limit
        if (currentDuration + sleepDuration > 12) {
            Logger.warn('Sleep duration exceeds 12 hours', requestId);
            const error = new Error('Sleep duration cannot be greater than 12 hours');
            error.code = 'SLEEP_DURATION_EXCEEDED';
            throw error;
        }

        if (!todayHealth.sleep) todayHealth.sleep = { duration: 0, entries: [] };
        if (!todayHealth.sleep.entries) todayHealth.sleep.entries = [];

        todayHealth.sleep.entries.push(entry);
        todayHealth.sleep.duration = Number((currentDuration + sleepDuration).toFixed(2));

        await todayHealth.save();
        Logger.info("Sleep updated in existing record", requestId);

    } else {
        // Create new record
        todayHealth = await DailyHealthData.create({
            userId,
            date: todayDate,
            sleep: {
                duration: sleepDuration,
                entries: [entry]
            }
        });
        Logger.info("New sleep record created", requestId);
    }

    return todayHealth;
}

/**
 * Fetch user goals with fallback
 */
async function fetchUserGoals(userId, timezone, requestId) {
    let userGoals = await Goals.findOne({ userId });
    
    if (!userGoals) {
        Logger.info("Goals not found, fetching from todayData", requestId);
        const { todayData } = await todayDataService({ userId, timezone, requestId });
        userGoals = todayData.goals;
    }

    return userGoals;
}

/**
 * Build 7-day sleep history with timezone support
 */
async function buildSleepHistory(userId, timezone, requestId) {
    const timeZoneUtil = require('../../../utils/timeZone');
    const todayDate = timeZoneUtil.getCurrentDateInTimezone(timezone);

    // Calculate date range
    const todayObj = new Date(todayDate + "T00:00:00Z");
    const sevenDaysAgoObj = new Date(todayObj);
    sevenDaysAgoObj.setDate(todayObj.getDate() - 6);
    const sevenDaysAgoString = sevenDaysAgoObj.toISOString().split("T")[0];

    // Fetch 7 days of data
    const last7Days = await DailyHealthData.find({
        userId,
        date: { $gte: sevenDaysAgoString, $lte: todayDate }
    })
    .sort({ date: 1 })
    .select("date sleep goalcomplete streak")
    .lean();

    // Create lookup map
    const dataMap = {};
    last7Days.forEach(d => dataMap[d.date] = d);

    // Build complete 7-day array (fill missing dates)
    const sleepHistory = [];
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(sevenDaysAgoObj);
        currentDate.setDate(sevenDaysAgoObj.getDate() + i);
        const dateString = currentDate.toISOString().split("T")[0];
        const record = dataMap[dateString];

        sleepHistory.push({
            date: dateString,
            totalDuration: record?.sleep?.duration || 0,
            entries: record?.sleep?.entries || []
        });
    }

    Logger.info("Sleep history built", requestId, { days: sleepHistory.length });
    return sleepHistory;
}

/**
 * Format goals for response
 */
function formatGoals(userGoals) {
    return {
        stepsGoal: userGoals.stepsGoal,
        caloriesBurnGoal: userGoals.caloriesBurnGoal,
        waterIntakeGoal: userGoals.waterIntakeGoal,
        caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
        sleepGoal: { 
            hours: userGoals.sleepGoal?.hours || 8 
        }
    };
}