// src/routes/health.route.js
const express = require('express');
const mongoose = require('mongoose');
const ResponseHandler = require('../utils/ResponseHandler');
const ConnectionHelper = require('../utils/connectionHelper');
const SMSProviderFactory = require('../services/sms/SMSProviderFactory');
const s3 = require('../services/s3Service');
const redisClient = require('../utils/redisClient');  // ⭐ Added Redis
const Logger = require('../utils/logger');

const router = express.Router();

// Health Check Route
router.get('/', async (req, res) => {
    const requestId = Logger.generateId('health');

    Logger.info(requestId, 'Health check route accessed');

    try {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();

        /* ---------------------------------------
         🔹 DATABASE CHECK (MongoDB)
        ----------------------------------------*/
        let dbStatus = 'disconnected';
        let dbHost = null;

        try {
            await ConnectionHelper.ensureConnection();
            dbStatus = 'connected';
            dbHost = mongoose.connection.host;
        } catch (dbErr) {
            Logger.error(requestId, 'MongoDB error during health check', { error: dbErr.message });
        }

        /* ---------------------------------------
         🔹 REDIS CHECK
        ----------------------------------------*/
        let redisStatus = 'disconnected';

        try {
            const pong = await redisClient.ping();
            redisStatus = pong === 'PONG' ? 'connected' : 'error';
        } catch (err) {
            redisStatus = 'error';
        }

        /* ---------------------------------------
         🔹 SMS PROVIDER CHECK
        ----------------------------------------*/
        const smsStatus = await SMSProviderFactory.healthCheck();

        /* ---------------------------------------
         🔹 S3 CHECK
        ----------------------------------------*/
        const s3Status = await s3.healthCheck();

        /* ---------------------------------------
         🔹 FINAL RESPONSE
        ----------------------------------------*/
        const finalStatus =
            dbStatus === 'connected' && redisStatus === 'connected'
                ? 'healthy'
                : 'degraded';

        const response = {
            status: finalStatus,
            message: 'Health Hustle API Server is running!',
            timestamp: new Date().toISOString(),
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            memory: {
                used: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
                total: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`
            },
            database: {
                status: dbStatus,
                readyState: mongoose.connection.readyState,
                host: dbHost,
                dbName: mongoose.connection.name
            },
            redis: {
                status: redisStatus,
                url: process.env.REDIS_URL ? 'configured' : 'missing'
            },
            sms: smsStatus,
            s3: s3Status,
            environment: process.env.NODE_ENV || 'development'
        };
        Logger.info(requestId, 'Health check success', response);
        return res.json(response);

    } catch (error) {
        Logger.error(requestId, 'Health check failed', { error });
        return ResponseHandler.serverError(res, 'Health check failed');
    }
});

module.exports = router;
