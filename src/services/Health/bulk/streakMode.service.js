// services/Health/bulk/streakMode.service.js

const DailyHealthRepository = require('../../../repositories/DailyHealthRepository');
const GoalsRepository = require('../../../repositories/GoalRepository');
const Logger = require('../../../utils/logger');
const { calculateAllGoals, calculateStreakCompletion, STREAK_GOALS } = require('../../../utils/goalcounter');

async function streakModeService({
    sortedData,
    allDates,
    firstDate,
    userId,
    timezone,
    requestId
}) {
    Logger.info("STREAK MODE: Fetching required records", requestId);

    // ------------------ 1. Fetch DB Records Using Repositories ------------------ //
    const previousDay = new Date(
        new Date(firstDate + "T00:00:00Z").getTime() - 24 * 60 * 60 * 1000
    )
        .toISOString()
        .split("T")[0];

    const [existingRecords, userGoals, prevRecord] = await Promise.all([
        DailyHealthRepository.findByUserAndDates(userId, allDates),
        GoalsRepository.findByUserId(userId),
        DailyHealthRepository.findPreviousRecord(userId, previousDay)
    ]);

    // Map existing data for quick lookup
    const recordMap = {};
    existingRecords.forEach(r => (recordMap[r.date] = r));

    const goals = userGoals || { stepsGoal: 10000 };

    let prevStreak = prevRecord ? prevRecord.streak : 0;
    let prevGoalCompleted = prevRecord ? prevRecord.goalcomplete : false;

    const bulkOps = [];
    const results = [];

    // ------------------ 2. Process Each Date ------------------ //
    for (const { date, data } of sortedData) {
        try {
            const existing = recordMap[date];

            // Remove sleep from goal logic
            const sanitized = { ...data };
            if (sanitized.sleep !== undefined) delete sanitized.sleep;

            const goalResults = calculateAllGoals(sanitized, existing, goals);
            const streakResults = calculateStreakCompletion(goalResults, STREAK_GOALS);

            const todayCompleted = streakResults.allCompleted;

            // ------------------ 3. Streak Logic ------------------ //
            let streak;
            if (!prevGoalCompleted) {
                streak = todayCompleted ? 1 : 0;
            } else {
                streak = todayCompleted ? prevStreak + 1 : prevStreak;
            }

            // ------------------ 4. Build Update Docs ------------------ //
            const setDoc = {
                userId,
                date,
                streak,
                goalcomplete: todayCompleted
            };

            if (data.steps?.count !== undefined) setDoc['steps.count'] = data.steps.count;
            if (data.sleep?.duration !== undefined) setDoc['sleep.duration'] = data.sleep.duration;
            if (data.heartRate?.avgBpm !== undefined) setDoc['heartRate.avgBpm'] = data.heartRate.avgBpm;
            if (data.calories?.burned !== undefined) setDoc['calories.burned'] = data.calories.burned;

            const setOnInsertDoc = {
                'calories.consumed': 0,
                'calories.entries': [],
                'water.consumed': 0,
                'water.entries': []
            };

            if (setDoc['calories.burned'] === undefined) {
                setOnInsertDoc['calories.burned'] = 0;
            }

            bulkOps.push({
                updateOne: {
                    filter: { userId, date },
                    update: { $set: setDoc, $setOnInsert: setOnInsertDoc },
                    upsert: true
                }
            });

            prevStreak = streak;
            prevGoalCompleted = todayCompleted;

            // Store result for logging and return
            results.push({
                date,
                streak,
                mode: "streak",
                status: existing ? "updated" : "created",
                goalsCompleted: {
                    ...goalResults,
                    completedCount: streakResults.completedGoals.length,
                    allCompleted: todayCompleted
                }
            });

        } catch (err) {
            Logger.error("Error processing streak mode", requestId, {
                date,
                message: err.message
            });
        }
    }

    // ------------------ 5. Write Final Bulk Ops ------------------ //
    if (bulkOps.length > 0) {
        await DailyHealthRepository.bulkWrite(bulkOps);
    }

    return { results };
}

module.exports = streakModeService;
