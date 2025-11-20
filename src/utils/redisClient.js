const { createClient } = require("redis");
require("dotenv").config();
const Logger = require("./logger");

const client = createClient({
  url: process.env.REDIS_URL, // redis:// (no TLS)
});

client.on("connect", () => Logger.info('redis-client', 'Connected to Redis Cloud (non-TLS)'));
client.on("error", (err) => Logger.error('redis-client', 'Redis error', { error: err.message }));

(async () => {
  try {
    await client.connect();
  } catch (err) {
    Logger.error('redis-client', 'Redis connection failed', { error: err.message });
  }
})();

module.exports = client;
