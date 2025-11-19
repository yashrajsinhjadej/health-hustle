// utils/filterquerybuilder.js
const Logger = require("./logger");


function buildUserFilterQuery(schedule, timezone, requestId) {
  // Base query - all users must have valid FCM tokens
  const query = {
    isActive: true,
    fcmToken: { $exists: true, $ne: null },
    "fcmToken.token": { $exists: true, $ne: null, $ne: "" },
    $or: [
      { notificationsEnabled: true },
      { notificationsEnabled: { $exists: false } },
    ],
  };

  // Add timezone filter if provided
  if (timezone) {
    query.timezone = timezone;
  }

  // Apply filters only if targetAudience is "filtered"
  if (schedule.targetAudience === "filtered" && schedule.filters) {
    const filters = schedule.filters;

    // Gender filter
    if (filters.gender && Array.isArray(filters.gender) && filters.gender.length > 0) {
      // Normalize to lowercase to match schema enum
      const normalizedGenders = filters.gender.map(g => String(g).toLowerCase());
      query.gender = { $in: normalizedGenders };
      Logger.debug(requestId, "🎯 Applied gender filter", { 
        original: filters.gender,
        normalized: normalizedGenders 
      });
    }

    // Platform filter
    if (filters.platform && Array.isArray(filters.platform) && filters.platform.length > 0) {
      // Normalize to lowercase
      const normalizedPlatforms = filters.platform.map(p => String(p).toLowerCase());
      query["fcmToken.platform"] = { $in: normalizedPlatforms };
      Logger.debug(requestId, "🎯 Applied platform filter", { 
        original: filters.platform,
        normalized: normalizedPlatforms 
      });
    }

    // Age range filter - using direct age field
    if (filters.ageRange) {
      const { min, max } = filters.ageRange;
      
      // Only apply filter if at least one value is provided
      if ((min !== null && min !== undefined && !isNaN(min)) || 
          (max !== null && max !== undefined && !isNaN(max))) {
        
        const ageQuery = {
          $exists: true,
          $type: "number"
        };

        if (min !== null && min !== undefined && !isNaN(min)) {
          ageQuery.$gte = parseInt(min);
        }

        if (max !== null && max !== undefined && !isNaN(max)) {
          ageQuery.$lte = parseInt(max);
        }

        query.age = ageQuery;
        
        Logger.debug(requestId, "🎯 Applied age filter", { 
          ageRange: filters.ageRange,
          ageQuery: query.age
        });
      }
    }

    Logger.info(requestId, "✅ Filters applied to user query", {
      targetAudience: schedule.targetAudience,
      filters: {
        gender: filters.gender,
        platform: filters.platform,
        ageRange: filters.ageRange,
      }
    });
  } else {
    Logger.info(requestId, "📢 Sending to ALL users (no filters)", {
      targetAudience: schedule.targetAudience
    });
  }

  return query;
}
module.exports = {
  buildUserFilterQuery,
};