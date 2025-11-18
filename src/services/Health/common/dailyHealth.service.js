// services/Health/common/dailyHealth.service.js
// this file is used to response in the format of the particular date 
const DailyHealthData = require('../../../models/DailyHealthData');
const Goals = require('../../../models/Goals');
const WaterConverter = require('../../../utils/waterConverter');
const timeZoneUtil = require('../../../utils/timeZone');
const Logger = require('../../../utils/logger');

async function dailyHealthService({ userId, date, timezone, requestId }) {
    Logger.info("DailyHealthService START", requestId, {
        userId,
        requestedDate: date,
        timezone
    });

    // ------------------ 1️⃣ Today (timezone-based) ------------------ //
    const todayDateString = timeZoneUtil.getCurrentDateInTimezone(
        timezone || "UTC"
    );

    const todayHealth = await DailyHealthData.findOne({
        userId,
        date: todayDateString
    }).lean();

    // ------------------ 2️⃣ Fetch selected date health ------------------ //
    const selectedHealth = await DailyHealthData.findOne({
        userId,
        date
    }).lean();

    // ------------------ 3️⃣ Fetch user goals ------------------ //
    let userGoals = await Goals.findOne({ userId }).lean();

    // Default goals fallback (same as old controller)
    if (!userGoals) {
        Logger.info("Creating default goals for user", requestId);

        userGoals = {
            stepsGoal: 10000,
            caloriesBurnGoal: 2000,
            waterIntakeGoal: 8,
            caloriesIntakeGoal: 2000,
            sleepGoal: { hours: 8 }
        };

        await Goals.create({ userId, ...userGoals });
    }

    const cleanGoals = {
        stepsGoal: userGoals.stepsGoal,
        caloriesBurnGoal: userGoals.caloriesBurnGoal,
        waterIntakeGoal: userGoals.waterIntakeGoal,
        caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
        sleepGoal: { hours: userGoals.sleepGoal?.hours }
    };

    // ------------------ 4️⃣ Build clean healthData ------------------ //
    let cleanHealthData;

    if (selectedHealth) {
        const h = { ...selectedHealth };

        cleanHealthData = {
            heartRate: h.heartRate ? { avgBpm: h.heartRate.avgBpm } : undefined,
            steps: h.steps ? { count: h.steps.count } : undefined,
            water: h.water
                ? {
                      consumed: WaterConverter.mlToGlasses(
                          h.water.consumed || 0
                      ),
                      entries: h.water.entries || []
                  }
                : undefined,
            calories: h.calories
                ? {
                      consumed: h.calories.consumed || 0,
                      burned: h.calories.burned || 0,
                      entries: h.calories.entries || []
                  }
                : undefined,
            sleep: h.sleep
                ? {
                      duration: h.sleep.duration,
                      entries: h.sleep.entries || []
                  }
                : undefined,
            date: h.date,

            // Always today's streak & goalcompletion
            goalcompletions: todayHealth?.goalcomplete || false,
            streak: todayHealth?.streak || 0
        };

        // remove undefined fields
        Object.keys(cleanHealthData).forEach(key => {
            if (cleanHealthData[key] === undefined) delete cleanHealthData[key];
        });

    } else {
        // No health record for requested date
        cleanHealthData = {
            date,
            goalcompletions: todayHealth?.goalcomplete || false,
            streak: todayHealth?.streak || 0
        };
    }

    Logger.info("DailyHealthService DONE", requestId, {
        hasSelectedHealth: !!selectedHealth,
        todayStreak: todayHealth?.streak
    });

    return {
        todayData: {
            healthData: cleanHealthData,
            goals: cleanGoals
        }
    };
}

module.exports = dailyHealthService;
