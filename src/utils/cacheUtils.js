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
      case "user":
        pattern = "user:*";
        break;
      case "admin":
        pattern = "admin:*";
        break;
      case "all":
        pattern = "*";
        break;
      default:
        pattern = `${type}:*`;
        break;
    }

    const keys = [];
    for await (const key of redisClient.scanIterator({ MATCH: pattern })) {
      // ensure key is string (not buffer)
      keys.push(String(key));
    }

    if (keys.length === 0) {
      Logger.info("ℹ️ No Redis keys found to clear", { pattern });
      return;
    }

    // ✅ use pipelined deletion for maximum safety
    const pipeline = redisClient.multi();
    for (const key of keys) {
      pipeline.del(key);
    }

    await pipeline.exec();
    Logger.info("🧹 Cleared Redis cache", {
      pattern,
      totalKeys: keys.length,
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
