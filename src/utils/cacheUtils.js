const redisClient = require("./redisClient");
const Logger = require("./logger");

async function clearCache(type = "all") {
  try {
    let pattern;

    switch (type) {
      case "homepage":
        pattern = "homepage:data";
        break;
      case "workout":
        pattern = "workout:*";
        break;
      case "admin":
        pattern = "admin:*";
        break;
      case "category":
        pattern = "category:*";
        break;
      case "all":
        pattern = "*";
        break;
      default:
        pattern = `${type}:*`;
        break;
    }

    Logger.info("🧹 Starting Redis cache clear", { type, pattern });

    // ⚡ Force use KEYS (safe for small dataset)
    const keys = await redisClient.keys(pattern);
    Logger.info("🔍 Keys matched", { total: keys.length, keys });

    if (keys.length === 0) {
      Logger.info("ℹ️ No Redis keys found to clear", { pattern });
      return;
    }

    // ⚙️ Delete all keys directly
    const deletedCount = await redisClient.del(keys);
    Logger.info("✅ Redis cache cleared", {
      pattern,
      totalKeysFound: keys.length,
      totalDeleted: deletedCount,
    });

  } catch (err) {
    Logger.error("❌ Error clearing Redis cache", {
      type,
      error: err.message,
      stack: err.stack,
    });
  }
}

module.exports = { clearCache };
