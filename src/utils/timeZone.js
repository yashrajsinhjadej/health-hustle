function isDateValidForTimezone(Date1, timezone) {
  try {
    // Parse input date
    const date = new Date(Date1);
    if (isNaN(date)) {
      return false; // invalid date input
    }

    // Format input date to YYYY-MM-DD
    const inputDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);

    // Get current date in user's timezone
    const nowInUserTZ = getCurrentDateInTimezone(timezone);

    // Compare the formatted dates
    console.log('Input date:', inputDateStr);
    console.log('Current date in timezone:', nowInUserTZ);
    
    return inputDateStr === nowInUserTZ;
  } catch (err) {
    console.error("Timezone validation error:", err);
    return false;
  }
}

function getCurrentDateInTimezone(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // returns like "2025-11-07"
    console.log('Current date in timezone:', formatter.format(new Date()));

    return formatter.format(new Date());
  } catch (err) {
    console.error("Invalid timezone:", err);
    return null;
  }
}
function getCurrentTimeInTimezone(timezone) {
  try {
    // Get user's current local time in that timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(new Date());
    const map = {};
    for (const { type, value } of parts) {
      if (type !== 'literal') map[type] = value;
    }

    // Build an ISO-like string in local timezone
    const localString = `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`;
    return localString; // e.g. "2025-11-17T22:45:00"
  } catch (err) {
    console.error("Invalid timezone:", err);
    return new Date().toISOString(); // fallback to UTC
  }
}


module.exports = {
  isDateValidForTimezone,
  getCurrentDateInTimezone,
  getCurrentTimeInTimezone
};
