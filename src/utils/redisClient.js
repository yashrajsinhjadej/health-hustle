const { createClient } = require("redis");
require("dotenv").config();

const client = createClient({
  url: process.env.REDIS_URL, // redis:// (no TLS)
});

client.on("connect", () => console.log("✅ Connected to Redis Cloud (non-TLS)"));
client.on("error", (err) => console.error("❌ Redis error:", err));

(async () => {
  try {
    await client.connect();
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
  }
})();

module.exports = client;
