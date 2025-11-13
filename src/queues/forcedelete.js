// File: scripts/cleanupQueue.js
const { Queue } = require("bullmq");
const Redis = require("ioredis");
const readline = require("readline");
require("dotenv").config();

(async () => {
  console.log("🧹 Starting BullMQ cleanup...");

  const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const queue = new Queue("notificationQueue", { connection });

  try {
    // 1️⃣ Drain all waiting/delayed jobs
    await queue.drain();
    console.log("✅ Drained all waiting and delayed jobs");

    // 2️⃣ Clean completed and failed jobs
    await queue.clean(0, 1000, "completed");
    await queue.clean(0, 1000, "failed");
    console.log("✅ Removed completed and failed jobs");

    // 3️⃣ Trim BullMQ events stream (keep last 500 entries)
    const streamKey = "bull:notificationQueue:events";
    const trimmed = await connection.xtrim(streamKey, "MAXLEN", "~", 500);
    console.log(`✅ Trimmed '${streamKey}' to last 500 entries (${trimmed} old entries removed)`);

    // 4️⃣ List remaining BullMQ keys
    const keys = await connection.keys("bull:notificationQueue*");
    console.log(`📊 Remaining BullMQ keys: ${keys.length}`);
    keys.forEach((k) => console.log("   -", k));

    // 5️⃣ Ask user if they want to force delete all keys
    if (keys.length > 0) {
      const shouldDelete = await askUser(
        "⚠️ Do you want to force delete ALL BullMQ keys (including delayed jobs)? (yes/no): "
      );
      if (shouldDelete.toLowerCase() === "yes") {
        const deleted = await connection.del(keys);
        console.log(`🧨 Force-deleted all BullMQ keys (${deleted} removed)`);
      } else {
        console.log("⏩ Skipped force deletion (kept delayed/daily jobs).");
      }
    }

    console.log("🎯 BullMQ cleanup completed successfully!");
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
  } finally {
    await connection.quit();
    process.exit(0);
  }
})();

/**
 * Ask user for confirmation in CLI
 */
function askUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}
