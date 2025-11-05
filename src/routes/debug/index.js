const express = require('express');
const router = express.Router();
const SMSProviderFactory = require('../../services/sms/SMSProviderFactory');


// Debug route for MongoDB connection testing
router.get('/debug', (req, res) => {
	const mongoUri = process.env.MONGODB_URI;
	const hasMongoUri = !!mongoUri;
	const mongoUriPreview = hasMongoUri ? 
		mongoUri.substring(0, 20) + '...' + mongoUri.substring(mongoUri.length - 20) : 
		'Not set';
	const debugInfo = {
		success: true,
		message: 'Debug Information',
		timestamp: new Date().toISOString(),
		environment: {
			NODE_ENV: process.env.NODE_ENV || 'not set',
			hasMongoUri: hasMongoUri,
			mongoUriPreview: mongoUriPreview,
			mongoConnectionState: require('mongoose').connection.readyState,
			mongoConnectionStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][require('mongoose').connection.readyState] || 'unknown'
		},
		mongoose: {
			readyState: require('mongoose').connection.readyState,
			host: require('mongoose').connection.host,
			port: require('mongoose').connection.port,
			name: require('mongoose').connection.name,
			readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][require('mongoose').connection.readyState] || 'unknown'
		},
		connectionInfo: {
			hasConnectionString: !!process.env.MONGODB_URI,
			connectionStringLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
			isProduction: process.env.NODE_ENV === 'production',
			serverless: process.env.VERCEL === '1'
		}
	};
	res.json(debugInfo);
});

// Environment variable debug route
router.get('/env-debug', (req, res) => {
	const mongoUri = process.env.MONGODB_URI;
	res.json({
		success: true,
		message: 'Environment Variable Debug',
		timestamp: new Date().toISOString(),
		mongoUri: {
			exists: !!mongoUri,
			length: mongoUri ? mongoUri.length : 0,
			startsWithMongo: mongoUri ? mongoUri.startsWith('mongodb') : false,
			startsWithMongoUri: mongoUri ? mongoUri.startsWith('MONGODB_URI=') : false,
			value: mongoUri || 'NOT_SET',
			preview: mongoUri ? mongoUri.substring(0, 50) + '...' : 'NOT_SET'
		},
		frontendUrl: {
			exists: !!process.env.FRONTEND_URL,
			value: process.env.FRONTEND_URL || 'NOT_SET',
			type: typeof process.env.FRONTEND_URL,
			isLocalhost: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.includes('localhost') : false,
			isHttps: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.startsWith('https') : false
		},
		environment: {
			NODE_ENV: process.env.NODE_ENV,
			VERCEL: process.env.VERCEL,
			VERCEL_URL: process.env.VERCEL_URL,
			VERCEL_ENV: process.env.VERCEL_ENV,
			hasMongoUri: !!process.env.MONGODB_URI,
			hasFrontendUrl: !!process.env.FRONTEND_URL
		},
		allUrlKeys: Object.keys(process.env).filter(key => key.includes('URL'))
	});
});

// Frontend URL debug route
router.get('/frontend-url-debug', (req, res) => {
	res.json({
		success: true,
		message: 'Frontend URL Configuration Check',
		timestamp: new Date().toISOString(),
		frontendUrl: {
			configured: !!process.env.FRONTEND_URL,
			value: process.env.FRONTEND_URL || 'NOT_CONFIGURED',
			fallbackUsed: !process.env.FRONTEND_URL,
			fallbackValue: 'http://localhost:3001',
			finalUrl: process.env.FRONTEND_URL || 'http://localhost:3001'
		},
		deployment: {
			isVercel: process.env.VERCEL === '1',
			vercelUrl: process.env.VERCEL_URL || 'NOT_VERCEL',
			environment: process.env.NODE_ENV || 'development'
		},
		sampleResetLink: {
			exampleToken: 'abc123-def456-ghi789',
			generatedLink: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/admin/reset-password?token=abc123-def456-ghi789`
		}
	});
});

// Test MongoDB connection route
router.get('/test-connection', async (req, res) => {
	const mongoose = require('mongoose');
	try {
		if (mongoose.connection.readyState === 1) {
			res.json({
				success: true,
				message: 'Already connected to MongoDB',
				connectionState: mongoose.connection.readyState,
				host: mongoose.connection.host,
				database: mongoose.connection.name
			});
		} else {
			await mongoose.connect(process.env.MONGODB_URI, {
				maxPoolSize: 5,
				serverSelectionTimeoutMS: 10000,
				socketTimeoutMS: 45000,
				family: 4,
				retryWrites: true,
				w: 'majority',
				bufferCommands: false,
				autoIndex: false,
				maxIdleTimeMS: 30000,
				connectTimeoutMS: 10000,
				heartbeatFrequencyMS: 10000,
			});
			res.json({
				success: true,
				message: 'Test connection successful',
				connectionState: mongoose.connection.readyState,
				host: mongoose.connection.host,
				database: mongoose.connection.name
			});
		}
	} catch (error) {
		res.status(500).json({ success: false, message: 'Test connection failed' });
	}
});

// Quick MongoDB diagnostic route
router.get('/mongo-diagnostic', async (req, res) => {
	const mongoose = require('mongoose');
	const diagnostic = {
		timestamp: new Date().toISOString(),
		environment: {
			NODE_ENV: process.env.NODE_ENV || 'not set',
			VERCEL: process.env.VERCEL || 'not set',
			hasMongoUri: !!process.env.MONGODB_URI
		},
		mongoUri: {
			exists: !!process.env.MONGODB_URI,
			length: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
			startsWithMongo: process.env.MONGODB_URI ? process.env.MONGODB_URI.startsWith('mongodb') : false,
			preview: process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 50) + '...' : 'NOT_SET'
		},
		mongoose: {
			readyState: mongoose.connection.readyState,
			readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
			host: mongoose.connection.host,
			port: mongoose.connection.port,
			name: mongoose.connection.name,
			error: mongoose.connection.error ? mongoose.connection.error.message : null
		}
	};
	if (mongoose.connection.readyState !== 1) {
		try {
			const ConnectionHelper = require('../../utils/connectionHelper');
			await ConnectionHelper.ensureConnection();
			diagnostic.connectionTest = {
				success: true,
				message: 'Connection successful'
			};
		} catch (error) {
			diagnostic.connectionTest = {
				success: false,
				error: error.message,
				errorName: error.name,
				errorCode: error.code
			};
		}
	} else {
		diagnostic.connectionTest = {
			success: true,
			message: 'Already connected'
		};
	}
	res.json(diagnostic);
});

// SMS Provider Debug Route
router.get('/sms-provider', async (req, res) => {
	try {
		const providerInfo = SMSProviderFactory.getProviderInfo();
		const health = await SMSProviderFactory.healthCheck();
		
		res.json({
			success: true,
			message: 'SMS Provider Information',
			timestamp: new Date().toISOString(),
			currentProvider: {
				name: SMSProviderFactory.getProviderName(),
				configured: process.env.SMS_PROVIDER || 'not set (using default)',
				...providerInfo
			},
			health: health,
			environment: {
				SMS_PROVIDER: process.env.SMS_PROVIDER || 'not set',
				// MSG91
				MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY ? 'configured' : 'missing',
				MSG91_SENDER_ID: process.env.MSG91_SENDER_ID || 'missing',
				MSG91_TEMPLATE_ID: process.env.MSG91_TEMPLATE_ID ? 'configured' : 'missing',
				// Twilio
				TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'missing',
				TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'missing',
				TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'missing'
			},
			availableProviders: ['simulation', 'msg91', 'twilio'],
			instructions: {
				switchProvider: 'Set SMS_PROVIDER environment variable to: simulation, msg91, or twilio',
				currentlyUsing: SMSProviderFactory.getProviderName(),
				isProduction: process.env.NODE_ENV === 'production'
			}
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Failed to get SMS provider info',
			error: error.message,
			timestamp: new Date().toISOString()
		});
	}
});

// SMS Provider Health Check Route
router.get('/sms-health', async (req, res) => {
	try {
		const health = await SMSProviderFactory.healthCheck();
		
		res.json({
			success: true,
			message: 'SMS Provider Health Check',
			timestamp: new Date().toISOString(),
			...health
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Health check failed',
			error: error.message,
			timestamp: new Date().toISOString()
		});
	}
});

// Test SMS Send Route (Simulation only for safety)
router.post('/test-sms', async (req, res) => {
	try {
		const { phone } = req.body;
		
		if (!phone) {
			return res.status(400).json({
				success: false,
				message: 'Phone number is required'
			});
		}
		
		// Force simulation mode for testing
		const SimulationProvider = require('../../services/sms/providers/SimulationProvider');
		const provider = new SimulationProvider();
		
		const result = await provider.sendOTP(phone, '123456');
		
		res.json({
			success: true,
			message: 'Test SMS sent (simulation mode)',
			timestamp: new Date().toISOString(),
			result: result,
			note: 'This endpoint always uses simulation mode for safety'
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Test SMS failed',
			error: error.message,
			timestamp: new Date().toISOString()
		});
	}
});

module.exports = router;
