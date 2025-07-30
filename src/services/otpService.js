// OTP Service - Business logic for OTP operations
const OTP = require('../models/OTP');
const OTPUtils = require('../utils/otpUtils');
const TwilioSMSService = require('./twilioSMSService');

class OTPService {
    
    // Create or update OTP with rate limiting
    async createOrUpdateOTP(phone, cooldownMinutes = 1) {
        try {
            // Generate new OTP using utils
            const otp = OTPUtils.generateOTP();
            
            // Find existing OTP for this phone
            const existingOTP = await OTP.findOne({ phone: phone });
            
            if (existingOTP) {
                // Check rate limiting
                const timeDiff = (new Date() - existingOTP.updatedAt) / 1000 ; // minutes. for minutes divide with 60 
                
                if (timeDiff < cooldownMinutes) {
                    const waitTime = Math.ceil(cooldownMinutes - timeDiff);
                    return { 
                        success: false,
                        message: `Please wait ${waitTime} minute(s) before requesting new OTP`,
                        waitTime: waitTime
                    };
                }
                
                // Update existing OTP with new values
                existingOTP.otp = otp;
                existingOTP.attempts = 0; // Reset attempts
                existingOTP.isUsed = false; // Reset used status
                existingOTP.expiresAt = new Date(Date.now() + 5 * 60 * 1000); // New expiry
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
            console.error('Create/Update OTP error:', error);
            return {
                success: false,
                message: 'Failed to create OTP. Please try again.',
                error: error.message
            };
        }
    }

    // Complete OTP sending workflow (create + send SMS)
    async sendOTP(phone, cooldownMinutes = 1) {
        try {
            // Accept only string of 10 digits
            if (typeof phone !== 'string' || !/^[0-9]{10}$/.test(phone)) {
                return {
                    success: false,
                    message: 'Phone number must be a string of exactly 10 digits.'
                };
            }

            // Create or update OTP in database
            const otpResult = await this.createOrUpdateOTP(phone, cooldownMinutes);
            
            if (!otpResult.success) {
                return otpResult; // Return rate limit error
            }

            // Send SMS using Twilio
            const smsResult = await TwilioSMSService.sendOTP(phone, otpResult.otp);
            
            if (!smsResult.success) {
                return {
                    success: false,
                    message: 'Failed to send OTP. Please try again.'
                };
            }

            return {
                success: true,
                message: 'OTP sent successfully',
                expiresIn: '5 minutes',
                otp: otpResult.otp // Only for testing; remove in production!
            };

        } catch (error) {
            console.error('Send OTP workflow error:', error);
            return {
                success: false,
                message: 'Failed to send OTP. Please try again.',
                error: error.message
            };
        }
    }

    // Verify OTP
    async verifyOTP(phone, otp) {
        try {
            // Accept only string of 10 digits
            if (typeof phone !== 'string' || !/^[0-9]{10}$/.test(phone)) {
                return {
                    success: false,
                    message: 'Phone number must be a string of exactly 10 digits.'
                };
            }

            // Validate OTP format (6 digits)
            if (!OTPUtils.isValidOTP(otp)) {
                return {
                    success: false,
                    message: 'Invalid OTP format. OTP must be 6 digits.'
                };
            }

            // Find valid OTP in database
            const otpRecord = await this.findValidOTP(phone, otp);
            
            if (!otpRecord) {
                // Try to find any OTP for this phone to increment attempts
                const anyOTP = await OTP.findOne({ phone: phone });
                
                if (anyOTP && !this.isExpired(anyOTP) && !this.hasMaxAttempts(anyOTP)) {
                    await this.incrementAttempts(anyOTP);
                    const remainingAttempts = 3 - anyOTP.attempts;
                    
                    return {
                        success: false,
                        message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
                        remainingAttempts: remainingAttempts
                    };
                }
                
                return {
                    success: false,
                    message: 'Invalid or expired OTP. Please request a new one.'
                };
            }

            // Mark OTP as used
            await this.markAsUsed(otpRecord);
            
            return {
                success: true,
                message: 'OTP verified successfully',
                otpRecord: otpRecord
            };

        } catch (error) {
            console.error('Verify OTP error:', error);
            return {
                success: false,
                message: 'Failed to verify OTP. Please try again.',
                error: error.message
            };
        }
    }

    // Helper methods that interact with the model
    async findValidOTP(phone, otp) {
        return await OTP.findOne({
            phone: phone,
            otp: otp,
            isUsed: false,
            expiresAt: { $gt: new Date() },
            attempts: { $lt: 3 }
        });
    }

    isExpired(otpRecord) {
        return new Date() > otpRecord.expiresAt;
    }

    hasMaxAttempts(otpRecord) {
        return otpRecord.attempts >= 3;
    }

    async incrementAttempts(otpRecord) {
        otpRecord.attempts += 1;
        return await otpRecord.save();
    }

    async markAsUsed(otpRecord) {
        otpRecord.isUsed = true;
        return await otpRecord.save();
    }

    // Cleanup expired/used OTPs (can be called by cron job)
    async cleanupExpiredOTPs() {
        try {
            const result = await OTP.deleteMany({
                $or: [
                    { isUsed: true },
                    { expiresAt: { $lt: new Date() } },
                    { attempts: { $gte: 3 } }
                ]
            });
            
            console.log(`🧹 Cleaned up ${result.deletedCount} expired/used OTPs`);
            return result;
        } catch (error) {
            console.error('Cleanup OTPs error:', error);
            throw error;
        }
    }

    // Get OTP statistics (for admin/monitoring)
    async getOTPStats() {
        try {
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
            console.error('Get OTP stats error:', error);
            throw error;
        }
    }
}

module.exports = new OTPService();
