// File: src/queues/notificationQueue.js
const { Queue } = require("bullmq");
const Redis = require("ioredis");
require("dotenv").config();

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("connect", () => console.log("✅ BullMQ connected to Redis Cloud"));
connection.on("error", (err) => console.error("❌ Redis (BullMQ) error:", err.message));

const notificationQueue = new Queue("notificationQueue", {
  connection,
  // Automatically remove jobs after completion or failure
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600, // ⏳ remove job 1 hour after completion (in seconds)
    },
    removeOnFail: {
      age: 3600, // ⏳ remove failed job after 1 hour as well
    },
  },
});

module.exports = { notificationQueue };
