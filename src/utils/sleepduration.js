/**
 * Calculates sleep duration in hours and minutes from bedtime and wakeup time (HH:MM 24-hour format)
 * @param {string} bedtime - Bedtime in 'HH:MM' format
 * @param {string} wakeupTime - Wakeup time in 'HH:MM' format
 * @returns {{hours: number, minutes: number, totalMinutes: number, formatted: string}}
 */
function calculateSleepDuration(bedtime, wakeupTime) {
    if (!bedtime || !wakeupTime) return null;
    const [bedHour, bedMin] = bedtime.split(':').map(Number);
    const [wakeHour, wakeMin] = wakeupTime.split(':').map(Number);
    if (
        isNaN(bedHour) || isNaN(bedMin) ||
        isNaN(wakeHour) || isNaN(wakeMin)
    ) {
        throw new Error('Invalid time format for sleep calculation');
    }
    const bedTotal = bedHour * 60 + bedMin;
    const wakeTotal = wakeHour * 60 + wakeMin;
    let durationMinutes = wakeTotal - bedTotal;
    if (durationMinutes <= 0) {
        durationMinutes += 24 * 60;
    }
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return {
        hours,
        minutes,
        totalMinutes: durationMinutes,
        formatted: `${hours}h ${minutes}m`
    };
}

module.exports = { calculateSleepDuration };

