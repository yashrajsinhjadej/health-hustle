const { Redis } = require('ioredis');
require('dotenv').config();

const createBullMQConnection = () => {
  return new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
};

module.exports = { createBullMQConnection };
