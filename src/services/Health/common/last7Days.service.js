// services/Health/common/last7Days.service.js

const DailyHealthData = require('../../../models/DailyHealthData');
const Goals = require('../../../models/Goals');
const timeZoneUtil = require('../../../utils/timeZone');
const WaterConverter = require('../../../utils/waterConverter');
const Logger = require('../../../utils/logger');

module.exports = async function last7DaysService({
    userId,
    timezone,
    requestId,
    field // "sleep" or "steps" etc.
}) {
    const todayDate = timeZoneUtil.getCurrentDateInTimezone(timezone);

    const todayObj = new Date(todayDate + "T00:00:00Z");
    const sevenDaysAgoObj = new Date(todayObj);
    sevenDaysAgoObj.setDate(todayObj.getDate() - 6);

    const sevenDaysAgo = sevenDaysAgoObj.toISOString().split("T")[0];

    // ---------------------------------------------
    // Fetch 7 days data
    // ---------------------------------------------
    const rangeData = await DailyHealthData.find({
        userId,
        date: { $gte: sevenDaysAgo, $lte: todayDate }
    })
        .sort({ date: 1 })
        .lean();

    const byDate = {};
    rangeData.forEach((d) => (byDate[d.date] = d));

    // ---------------------------------------------
    // Helper for STEP ESTIMATES
    // ---------------------------------------------
    const calculateStepEstimates = (steps) => {
        if (!steps || steps === 0) {
            return {
                estimatedCaloriesBurned: 0,
                estimatedWalkingTimeMinutes: 0,
                estimatedDistanceKm: 0
            };
        }
        return {
            estimatedCaloriesBurned: Math.round(steps * 0.04),
            estimatedWalkingTimeMinutes: Math.round(steps / 100),
            estimatedDistanceKm: Math.round((steps / 1250) * 100) / 100
        };
    };

    // ---------------------------------------------
    // Build unified last 7 days array
    // ---------------------------------------------
    const last7Days = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgoObj);
        d.setDate(sevenDaysAgoObj.getDate() + i);
        const dateString = d.toISOString().split("T")[0];

        const dayData = byDate[dateString];

        if (field === "sleep") {
            last7Days.push({
                date: dateString,
                totalDuration: dayData?.sleep?.duration || 0,
                entries: dayData?.sleep?.entries || []
            });
        }

        if (field === "steps") {
            const steps = dayData?.steps?.count || 0;
            last7Days.push({
                date: dateString,
                totalSteps: steps,
                entries: dayData?.steps?.entries || [],
                estimates: calculateStepEstimates(steps)
            });
        }
    }

    // ---------------------------------------------
    // Fetch Goals + Today’s streak/completions
    // ---------------------------------------------
    let userGoals = await Goals.findOne({ userId });
    if (!userGoals) {
        userGoals = await Goals.create({
            userId,
            stepsGoal: 10000,
            caloriesBurnGoal: 2000,
            waterIntakeGoal: 8,
            caloriesIntakeGoal: 2000,
            sleepGoal: { hours: 8 }
        });
    }

    const todayHealth = byDate[todayDate];

    const cleanGoals = {
        stepsGoal: userGoals.stepsGoal,
        caloriesBurnGoal: userGoals.caloriesBurnGoal,
        waterIntakeGoal: userGoals.waterIntakeGoal,
        caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
        sleepGoal: { hours: userGoals.sleepGoal?.hours }
    };

    return {
        last7Days,
        goalcompletions: todayHealth?.goalcomplete || false,
        streak: todayHealth?.streak || 0,
        goals: cleanGoals
    };
};
