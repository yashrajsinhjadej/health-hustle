// services/Health/common/todayData.service.js

const DailyHealthData = require('../../../models/DailyHealthData');
const Goals = require('../../../models/Goals');
const WaterConverter = require('../../../utils/waterConverter');
const timeZoneUtil = require('../../../utils/timeZone');
const Logger = require('../../../utils/logger');

async function todayDataService({ userId, timezone, requestId }) {
    try {
        const todayDateString = timeZoneUtil.getCurrentDateInTimezone(timezone || 'UTC');

        Logger.info("Fetching today's health + goals", requestId, {
            userId,
            today: todayDateString
        });

        // -----------------------------------------
        // 1️⃣ Today's health record
        // -----------------------------------------
        const todayHealth = await DailyHealthData.findOne({
            userId,
            date: todayDateString
        });

        // -----------------------------------------
        // 2️⃣ Ensure goals exist
        // -----------------------------------------
        let todayGoals = await Goals.findOne({ userId });

        if (!todayGoals) {
            todayGoals = await Goals.create({
                userId,
                stepsGoal: 10000,
                caloriesBurnGoal: 2000,
                waterIntakeGoal: 8,
                caloriesIntakeGoal: 2000,
                sleepGoal: { hours: 8 }
            });

            Logger.info("Default goals created via todayDataService", requestId);
        }

        // -----------------------------------------
        // 3️⃣ Build response
        // -----------------------------------------
        let todayData;

        if (todayHealth) {
            const formatted = todayHealth.toObject();

            const cleanHealthData = {
                heartRate: formatted.heartRate
                    ? { avgBpm: formatted.heartRate.avgBpm }
                    : undefined,
                steps: formatted.steps
                    ? { count: formatted.steps.count }
                    : undefined,
                water: formatted.water
                    ? {
                        consumed: WaterConverter.mlToGlasses(
                            formatted.water.consumed || 0
                        ),
                        entries: formatted.water.entries || []
                    }
                    : undefined,
                calories: formatted.calories
                    ? {
                        consumed: formatted.calories.consumed || 0,
                        burned: formatted.calories.burned || 0,
                        entries: formatted.calories.entries || []
                    }
                    : undefined,
                sleep: formatted.sleep
                    ? {
                        duration: formatted.sleep.duration,
                        entries: formatted.sleep.entries || []
                    }
                    : undefined,
                date: formatted.date,
                goalcompletions: formatted.goalcomplete,
                streak: formatted.streak
            };

            // Remove undefined
            Object.keys(cleanHealthData).forEach(key => {
                if (cleanHealthData[key] === undefined) delete cleanHealthData[key];
            });

            const cleanGoals = {
                stepsGoal: todayGoals.stepsGoal,
                caloriesBurnGoal: todayGoals.caloriesBurnGoal,
                waterIntakeGoal: todayGoals.waterIntakeGoal,
                caloriesIntakeGoal: todayGoals.caloriesIntakeGoal,
                sleepGoal: { hours: todayGoals.sleepGoal?.hours }
            };

            todayData = { healthData: cleanHealthData, goals: cleanGoals };
        } else {
            // No health today → still return goals
            const cleanGoals = {
                stepsGoal: todayGoals.stepsGoal,
                caloriesBurnGoal: todayGoals.caloriesBurnGoal,
                waterIntakeGoal: todayGoals.waterIntakeGoal,
                caloriesIntakeGoal: todayGoals.caloriesIntakeGoal,
                sleepGoal: { hours: todayGoals.sleepGoal?.hours }
            };

            todayData = { healthData: null, goals: cleanGoals };
        }

        return { todayData };

    } catch (err) {
        Logger.error('todayDataService error', requestId, {
            message: err.message
        });
        throw err;
    }
}

module.exports = todayDataService;
