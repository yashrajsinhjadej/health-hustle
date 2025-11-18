// services/Health/reports/weeklyReport.service.js

const DailyHealthData = require('../../../models/DailyHealthData');
const Goals = require('../../../models/Goals');
const WaterConverter = require('../../../utils/waterConverter');
const Logger = require('../../../utils/logger');
const timeZoneUtil = require('../../../utils/timeZone');

module.exports = async function weeklyReportService({
    userId,
    date,
    timezone,
    requestId
}) {
    try {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!date || !dateRegex.test(date)) {
            return { error: true, message: 'Invalid date format. Please use YYYY-MM-DD format' };
        }

        const inputDate = new Date(date + "T00:00:00Z");
        if (isNaN(inputDate.getTime())) {
            return { error: true, message: 'Invalid date provided' };
        }

        Logger.info("Weekly report START", requestId, { userId, date });

        const dayOfWeek = inputDate.getUTCDay();

        const weekStart = new Date(inputDate);
        weekStart.setUTCDate(inputDate.getUTCDate() - dayOfWeek);
        weekStart.setUTCHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

        const weekStartString = weekStart.toISOString().split("T")[0];
        const weekEndString = weekEnd.toISOString().split("T")[0];

        const userGoals = await Goals.findOne({ userId }).lean();

        const weeklyHealthData = await DailyHealthData.find({
            userId,
            date: { $gte: weekStartString, $lte: weekEndString }
        })
            .select("date water.consumed calories.consumed calories.burned sleep.duration steps.count")
            .sort({ date: 1 })
            .lean();

        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setUTCDate(weekStart.getUTCDate() + i);
            weekDates.push({
                date: d.toISOString().split("T")[0],
                dayName: dayNames[i]
            });
        }

        const dailyBreakdown = weekDates.map(({ date, dayName }) => {
            const d = weeklyHealthData.find(x => x.date === date);
            return {
                date,
                dayName,
                water: {
                    ml: d?.water?.consumed || 0,
                    glasses: WaterConverter.mlToGlasses(d?.water?.consumed || 0)
                },
                calories: {
                    consumed: d?.calories?.consumed || 0,
                    burned: d?.calories?.burned || 0
                },
                steps: {
                    count: d?.steps?.count || 0,
                    entries: d?.steps?.entries || []
                },
                sleep: {
                    duration: d?.sleep?.duration || 0,
                    entries: d?.sleep?.entries || []
                }
            };
        });

        const totalWaterIntake = weeklyHealthData.reduce((sum, d) => sum + (d.water?.consumed || 0), 0);
        const totalCaloriesConsumed = weeklyHealthData.reduce((sum, d) => sum + (d.calories?.consumed || 0), 0);
        const totalCaloriesBurned = weeklyHealthData.reduce((sum, d) => sum + (d.calories?.burned || 0), 0);
        const totalSleepDuration = weeklyHealthData.reduce((sum, d) => sum + (d.sleep?.duration || 0), 0);
        const totalSteps = weeklyHealthData.reduce((sum, d) => sum + (d.steps?.count || 0), 0);

        const todayDateString = timeZoneUtil.getCurrentDateInTimezone(timezone);
        const todayRecord = await DailyHealthData.findOne({ userId, date: todayDateString });
        const streak = todayRecord?.streak || 0;

        Logger.info("Weekly report SUCCESS", requestId);

        return {
            weekInfo: {
                inputDate: date,
                inputDayName: dayNames[dayOfWeek],
                weekStartDate: weekStartString,
                weekEndDate: weekEndString,
                weekRange: `${weekStartString} to ${weekEndString}`
            },
            userGoals,
            dailyBreakdown,
            streak,
            weekSummary: {
                water: {
                    totalGlasses: WaterConverter.mlToGlasses(totalWaterIntake),
                    totalConsumed: totalWaterIntake
                },
                calories: {
                    totalConsumed: totalCaloriesConsumed,
                    totalBurned: totalCaloriesBurned
                },
                sleep: {
                    totalDuration: totalSleepDuration
                },
                steps: {
                    totalCount: totalSteps
                }
            }
        };

    } catch (err) {
        Logger.error("Weekly report FAILED", requestId, {
            message: err.message
        });
        return { error: true, message: "Failed to get weekly water report" };
    }
};
