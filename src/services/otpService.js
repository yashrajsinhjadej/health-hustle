// OTP Service - Business logic for OTP operations
const OTP = require('../models/OTP');
const OTPUtils = require('../utils/otpUtils');
const SMSProviderFactory = require('./sms/SMSProviderFactory');
const ConnectionHelper = require('../utils/connectionHelper');
const Logger = require('../utils/logger');

class OTPService {
    
    // Create or update OTP (no cooldown/rate limit, handled by custom rate limiter)
    async createOrUpdateOTP(phone) {
        try {
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();

            // Generate new OTP using utils
            const otp = OTPUtils.generateOTP();

            // Find existing OTP for this phone
            const existingOTP = await OTP.findOne({ phone: phone });

            if (existingOTP) {
                // Update existing OTP with new values
                existingOTP.otp = otp;
                existingOTP.attempts = 0; // Reset attempts
                existingOTP.isUsed = false; // Reset used status

                // Use environment variable for expiry time
                const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
                existingOTP.expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
                await existingOTP.save();

                return {
                    success: true,
                    message: 'OTP updated successfully',
                    otp: otp,
                    otpRecord: existingOTP
                };
            } else {
                // Create new OTP record
                const newOTP = await OTP.create({
                    phone: phone,
                    otp: otp
                });

                return {
                    success: true,
                    message: 'New OTP created successfully',
                    otp: otp,
                    otpRecord: newOTP
                };
            }
        } catch (error) {
            Logger.error('OTPService', 'createOrUpdateOTP', 'Create/Update OTP error', {
                error: error.message,
                stack: error.stack
            });
            return {
                success: false,
                message: 'Failed to create OTP. Please try again.',
                error: error.message
            };
        }
    }

    // Complete OTP sending workflow (create + send SMS)
    async sendOTP(phone, cooldownSeconds = null) {
        try {
            // Accept only string of 10 digits
            if (typeof phone !== 'string' || !/^[0-9]{10}$/.test(phone)) {
                return {
                    success: false,
                    message: 'Invalid phone number format',
                    error: 'Phone number must be exactly 10 digits',
                    code: 'INVALID_PHONE'
                };
            }

            // Create or update OTP in database
            const otpResult = await this.createOrUpdateOTP(phone);

            if (!otpResult.success) {
                return {
                    ...otpResult,
                    code: 'OTP_CREATION_FAILED'
                };
            }

            // Get SMS provider from factory
            const smsProvider = SMSProviderFactory.getProvider();
            const providerName = SMSProviderFactory.getProviderName();
            
            Logger.info('otp-send', `Using SMS Provider: ${providerName}`, { phone });

            // Send SMS using configured provider
            const smsResult = await smsProvider.sendOTP(phone, otpResult.otp);

            if (!smsResult.success) {
                return {
                    success: false,
                    message: 'Failed to send OTP',
                    error: 'SMS service is temporarily unavailable. Please try again.',
                    code: 'SMS_SEND_FAILED'
                };
            }

            // Return success with provider info
            return {
                success: true,
                message: 'OTP sent successfully',
                otp: otpResult.otp, // Include OTP in response for testing
                provider: smsResult.provider,
                messageId: smsResult.messageId
            };

        } catch (error) {
            Logger.error('OTPService', 'sendOTP', 'Send OTP workflow error', {
                error: error.message,
                stack: error.stack
            });
            return {
                success: false,
                message: 'Failed to send OTP',
                error: 'An unexpected error occurred. Please try again.',
                code: 'INTERNAL_ERROR'
            };
        }
    }

    // Verify OTP
    async verifyOTP(phone, otp) {
        const requestId = Logger.generateId('otp-verify');
        
        try {
            Logger.info(requestId, 'OTP Verification START', { phone, otp: '***' });
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Accept only string of 10 digits
            if (typeof phone !== 'string' || !/^[0-9]{10}$/.test(phone)) {
                Logger.warn(requestId, 'Invalid phone format', { 
                    phone, 
                    type: typeof phone 
                });
                return {
                    success: false,
                    message: 'Invalid phone number format',
                    error: 'Phone number must be exactly 10 digits',
                    code: 'INVALID_PHONE'
                };
            }

            // Validate OTP format (6 digits)
            if (!OTPUtils.isValidOTP(otp)) {
                Logger.warn(requestId, 'Invalid OTP format', { 
                    otp: '***', 
                    type: typeof otp 
                });
                return {
                    success: false,
                    message: 'Invalid OTP format',
                    error: 'OTP must be exactly 6 digits',
                    code: 'INVALID_OTP_FORMAT'
                };
            }

            Logger.debug(requestId, 'Input validation passed', { phone, otp: '***' });

            // Find valid OTP in database
            Logger.debug(requestId, 'Searching for valid OTP in database');
            const otpRecord = await this.findValidOTP(phone, otp, requestId);
            
            if (!otpRecord) {
                Logger.warn(requestId, 'NO VALID OTP FOUND', { phone, otp: '***' });
                
                // Debug: Let's see what OTP records exist for this phone
                Logger.debug(requestId, 'Checking ALL OTP records for debugging', { phone });
                const allOTPs = await OTP.find({ phone: phone }).sort({ createdAt: -1 });
                Logger.debug(requestId, 'OTP records found', { 
                    phone,
                    totalRecords: allOTPs.length,
                    records: allOTPs.map((record, index) => ({
                        index: index + 1,
                        otp: record.otp === otp ? 'CURRENT' : 'OTHER',
                        isUsed: record.isUsed,
                        attempts: record.attempts,
                        expired: new Date() > record.expiresAt,
                        expiresAt: record.expiresAt,
                        createdAt: record.createdAt
                    }))
                });
                
                // Try to find any OTP for this phone to increment attempts
                const anyOTP = await OTP.findOne({ phone: phone });
                
                if (anyOTP && !this.isExpired(anyOTP, requestId) && !this.hasMaxAttempts(anyOTP, requestId)) {
                    Logger.debug(requestId, 'Incrementing attempts', { 
                        phone, 
                        currentAttempts: anyOTP.attempts 
                    });
                    const updatedOTP = await this.incrementAttempts(anyOTP, requestId);
                    const remainingAttempts = 3 - updatedOTP.attempts;
                    
                    // Check if this was the last attempt
                    if (remainingAttempts <= 0) {
                        Logger.warn(requestId, 'Max attempts reached', { phone });
                        return {
                            success: false,
                            message: 'Maximum verification attempts exceeded',
                            error: 'Please request a new OTP',
                            code: 'MAX_ATTEMPTS_EXCEEDED'
                        };
                    }
                    
                    return {
                        success: false,
                        message: 'Invalid OTP',
                        error: `${remainingAttempts} attempt(s) remaining`,
                        code: 'INVALID_OTP',
                        remainingAttempts: remainingAttempts
                    };
                }
                
                Logger.warn(requestId, 'No valid/non-expired OTP found or max attempts reached');
                return {
                    success: false,
                    message: 'Invalid or expired OTP',
                    error: 'Please request a new OTP',
                    code: 'OTP_NOT_FOUND'
                };
            }

            Logger.success(requestId, 'VALID OTP FOUND', { phone, otp: '***' });
            Logger.debug(requestId, 'OTP Record details BEFORE marking as used', {
                otp: '***',
                isUsed: otpRecord.isUsed,
                attempts: otpRecord.attempts,
                expiresAt: otpRecord.expiresAt,
                createdAt: otpRecord.createdAt
            });
            
            // Mark OTP as used
            Logger.debug(requestId, 'Marking OTP as used');
            const savedRecord = await this.markAsUsed(otpRecord, requestId);
            
            Logger.success(requestId, 'OTP marked as used successfully');
            Logger.debug(requestId, 'OTP Record details AFTER marking as used', {
                otp: '***',
                isUsed: savedRecord.isUsed,
                attempts: savedRecord.attempts,
                expiresAt: savedRecord.expiresAt
            });
            
            return {
                success: true,
                message: 'OTP verified successfully',
                otpRecord: savedRecord
            };

        } catch (error) {
            Logger.error(requestId, 'Verify OTP error', {
                error: error.message,
                stack: error.stack
            });
            return {
                success: false,
                message: 'Failed to verify OTP',
                error: 'An unexpected error occurred. Please try again.',
                code: 'INTERNAL_ERROR'
            };
        }
    }

    // Helper methods that interact with the model
    async findValidOTP(phone, otp, requestId = 'otp-find') {
        // Ensure MongoDB connection is ready
        await ConnectionHelper.ensureConnection();
        
        Logger.debug(requestId, 'findValidOTP: Searching', { 
            phone, 
            otp: '***',
            criteria: {
                phone,
                otp: '***',
                isUsed: false,
                expiresGt: new Date(),
                attemptsLt: 3
            }
        });
        
        const result = await OTP.findOne({
            phone: phone,
            otp: otp,
            isUsed: false,
            expiresAt: { $gt: new Date() },
            attempts: { $lt: 3 }
        });
        
        if (result) {
            Logger.debug(requestId, 'findValidOTP: Found valid OTP record');
        } else {
            Logger.debug(requestId, 'findValidOTP: No valid OTP record found');
        }
        
        return result;
    }

    isExpired(otpRecord, requestId = 'otp-check') {
        const isExpired = new Date() > otpRecord.expiresAt;
        Logger.debug(requestId, 'isExpired check', { 
            isExpired,
            current: new Date(),
            expires: otpRecord.expiresAt
        });
        return isExpired;
    }

    hasMaxAttempts(otpRecord, requestId = 'otp-check') {
        const hasMax = otpRecord.attempts >= 3;
        Logger.debug(requestId, 'hasMaxAttempts check', { 
            hasMax,
            attempts: otpRecord.attempts
        });
        return hasMax;
    }

    async incrementAttempts(otpRecord, requestId = 'otp-increment') {
        Logger.debug(requestId, 'incrementAttempts: Before', { 
            attempts: otpRecord.attempts 
        });
        otpRecord.attempts += 1;
        const saved = await otpRecord.save();
        Logger.debug(requestId, 'incrementAttempts: After', { 
            attempts: saved.attempts 
        });
        return saved;
    }

    async markAsUsed(otpRecord, requestId = 'otp-mark') {
        Logger.debug(requestId, 'markAsUsed: Before', { 
            isUsed: otpRecord.isUsed,
            phone: otpRecord.phone,
            otp: '***'
        });
        otpRecord.isUsed = true;
        
        try {
            const saved = await otpRecord.save();
            Logger.success(requestId, 'markAsUsed: Successfully saved', { 
                isUsed: saved.isUsed,
                phone: saved.phone,
                otp: '***'
            });
            
            // Double-check by querying the database
            const verification = await OTP.findById(saved._id);
            Logger.debug(requestId, 'markAsUsed: Database verification', { 
                isUsed: verification.isUsed 
            });
            
            return saved;
        } catch (error) {
            Logger.error(requestId, 'markAsUsed: Failed to save', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Cleanup expired/used OTPs (can be called by cron job)
    async cleanupExpiredOTPs() {
        const requestId = Logger.generateId('otp-cleanup');
        
        try {
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            const result = await OTP.deleteMany({
                $or: [
                    { isUsed: true },
                    { expiresAt: { $lt: new Date() } },
                    { attempts: { $gte: 3 } }
                ]
            });
            
            Logger.success(requestId, 'Cleaned up expired/used OTPs', { 
                deletedCount: result.deletedCount 
            });
            return result;
        } catch (error) {
            Logger.error(requestId, 'Cleanup OTPs error', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Get OTP statistics (for admin/monitoring)
    async getOTPStats() {
        const requestId = Logger.generateId('otp-stats');
        
        try {
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            const stats = await OTP.aggregate([
                {
                    $group: {
                        _id: null,
                        totalOTPs: { $sum: 1 },
                        usedOTPs: { 
                            $sum: { $cond: [{ $eq: ["$isUsed", true] }, 1, 0] } 
                        },
                        expiredOTPs: { 
                            $sum: { $cond: [{ $lt: ["$expiresAt", new Date()] }, 1, 0] } 
                        },
                        maxAttemptsOTPs: { 
                            $sum: { $cond: [{ $gte: ["$attempts", 3] }, 1, 0] } 
                        }
                    }
                }
            ]);

            return stats[0] || {
                totalOTPs: 0,
                usedOTPs: 0,
                expiredOTPs: 0,
                maxAttemptsOTPs: 0
            };
        } catch (error) {
            Logger.error(requestId, 'Get OTP stats error', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

module.exports = new OTPService();
