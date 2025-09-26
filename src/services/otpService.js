// OTP Service - Business logic for OTP operations
const OTP = require('../models/OTP');
const OTPUtils = require('../utils/otpUtils');
const TwilioSMSService = require('./twilioSMSService');
const ConnectionHelper = require('../utils/connectionHelper');

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
            console.error('Create/Update OTP error:', error);
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
                    message: 'Phone number must be a string of exactly 10 digits.'
                };
            }

            // Create or update OTP in database
            const otpResult = await this.createOrUpdateOTP(phone);

            if (!otpResult.success) {
                return otpResult;
            }

            // Send SMS using Twilio
            const smsResult = await TwilioSMSService.sendOTP(phone, otpResult.otp);

            if (!smsResult.success) {
                return {
                    success: false,
                    message: 'Failed to send OTP. Please try again.'
                };
            }

            // Always include OTP in response for now (testing)
            return {
                success: true,
                message: 'OTP sent successfully',
                otp: otpResult.otp
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
            console.log(`🔐 OTP Verification START - Phone: ${phone}, OTP: ${otp}`);
            
            // Ensure MongoDB connection is ready
            await ConnectionHelper.ensureConnection();
            
            // Accept only string of 10 digits
            if (typeof phone !== 'string' || !/^[0-9]{10}$/.test(phone)) {
                console.log(`❌ Invalid phone format: ${phone} (type: ${typeof phone})`);
                return {
                    success: false,
                    message: 'Phone number must be a string of exactly 10 digits.'
                };
            }

            // Validate OTP format (6 digits)
            if (!OTPUtils.isValidOTP(otp)) {
                console.log(`❌ Invalid OTP format: ${otp} (type: ${typeof otp})`);
                return {
                    success: false,
                    message: 'Invalid OTP format. OTP must be 6 digits.'
                };
            }

            console.log(`✅ Input validation passed - Phone: ${phone}, OTP: ${otp}`);

            // Find valid OTP in database
            console.log(`🔍 Searching for valid OTP in database...`);
            const otpRecord = await this.findValidOTP(phone, otp);
            
            if (!otpRecord) {
                console.log(`❌ NO VALID OTP FOUND - Phone: ${phone}, OTP: ${otp}`);
                
                // Debug: Let's see what OTP records exist for this phone
                console.log(`🔍 Debugging: Checking ALL OTP records for phone ${phone}...`);
                const allOTPs = await OTP.find({ phone: phone }).sort({ createdAt: -1 });
                console.log(`📊 Found ${allOTPs.length} OTP records for phone ${phone}:`);
                
                allOTPs.forEach((record, index) => {
                    const isCurrentOTP = record.otp === otp;
                    const isExpired = new Date() > record.expiresAt;
                    console.log(`   ${index + 1}. OTP: ${record.otp} ${isCurrentOTP ? '👈 CURRENT' : ''}`);
                    console.log(`      - isUsed: ${record.isUsed}`);
                    console.log(`      - attempts: ${record.attempts}`);
                    console.log(`      - expired: ${isExpired} (expires: ${record.expiresAt})`);
                    console.log(`      - created: ${record.createdAt}`);
                    console.log(`      ---`);
                });
                
                // Try to find any OTP for this phone to increment attempts
                const anyOTP = await OTP.findOne({ phone: phone });
                
                if (anyOTP && !this.isExpired(anyOTP) && !this.hasMaxAttempts(anyOTP)) {
                    console.log(`⚠️ Incrementing attempts for phone: ${phone} (current attempts: ${anyOTP.attempts})`);
                    await this.incrementAttempts(anyOTP);
                    const remainingAttempts = 3 - anyOTP.attempts;
                    
                    return {
                        success: false,
                        message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
                        remainingAttempts: remainingAttempts
                    };
                }
                
                console.log(`❌ No valid/non-expired OTP found or max attempts reached`);
                return {
                    success: false,
                    message: 'Invalid or expired OTP. Please request a new one.'
                };
            }

            console.log(`✅ VALID OTP FOUND! - Phone: ${phone}, OTP: ${otp}`);
            console.log(`📊 OTP Record details BEFORE marking as used:`);
            console.log(`   - OTP: ${otpRecord.otp}`);
            console.log(`   - isUsed: ${otpRecord.isUsed}`);
            console.log(`   - attempts: ${otpRecord.attempts}`);
            console.log(`   - expiresAt: ${otpRecord.expiresAt}`);
            console.log(`   - createdAt: ${otpRecord.createdAt}`);
            
            // Mark OTP as used
            console.log(`🔄 Marking OTP as used...`);
            const savedRecord = await this.markAsUsed(otpRecord);
            
            console.log(`✅ OTP marked as used successfully!`);
            console.log(`📊 OTP Record details AFTER marking as used:`);
            console.log(`   - OTP: ${savedRecord.otp}`);
            console.log(`   - isUsed: ${savedRecord.isUsed}`);
            console.log(`   - attempts: ${savedRecord.attempts}`);
            console.log(`   - expiresAt: ${savedRecord.expiresAt}`);
            
            return {
                success: true,
                message: 'OTP verified successfully',
                otpRecord: savedRecord
            };

        } catch (error) {
            console.error('❌ Verify OTP error:', error);
            console.error('❌ Error stack:', error.stack);
            return {
                success: false,
                message: 'Failed to verify OTP. Please try again.',
                error: error.message
            };
        }
    }

    // Helper methods that interact with the model
    async findValidOTP(phone, otp) {
        // Ensure MongoDB connection is ready
        await ConnectionHelper.ensureConnection();
        
        console.log(`🔍 findValidOTP: Searching for phone=${phone}, otp=${otp}`);
        console.log(`🔍 Query criteria: { phone: "${phone}", otp: "${otp}", isUsed: false, expiresAt: { $gt: "${new Date()}" }, attempts: { $lt: 3 } }`);
        
        const result = await OTP.findOne({
            phone: phone,
            otp: otp,
            isUsed: false,
            expiresAt: { $gt: new Date() },
            attempts: { $lt: 3 }
        });
        
        if (result) {
            console.log(`✅ findValidOTP: Found valid OTP record`);
        } else {
            console.log(`❌ findValidOTP: No valid OTP record found`);
        }
        
        return result;
    }

    isExpired(otpRecord) {
        const isExpired = new Date() > otpRecord.expiresAt;
        console.log(`🔍 isExpired: ${isExpired} (current: ${new Date()}, expires: ${otpRecord.expiresAt})`);
        return isExpired;
    }

    hasMaxAttempts(otpRecord) {
        const hasMax = otpRecord.attempts >= 3;
        console.log(`🔍 hasMaxAttempts: ${hasMax} (attempts: ${otpRecord.attempts})`);
        return hasMax;
    }

    async incrementAttempts(otpRecord) {
        console.log(`🔄 incrementAttempts: Before - attempts: ${otpRecord.attempts}`);
        otpRecord.attempts += 1;
        const saved = await otpRecord.save();
        console.log(`✅ incrementAttempts: After - attempts: ${saved.attempts}`);
        return saved;
    }

    async markAsUsed(otpRecord) {
        console.log(`🔄 markAsUsed: Before - isUsed: ${otpRecord.isUsed}, phone: ${otpRecord.phone}, otp: ${otpRecord.otp}`);
        otpRecord.isUsed = true;
        
        try {
            const saved = await otpRecord.save();
            console.log(`✅ markAsUsed: Successfully saved - isUsed: ${saved.isUsed}, phone: ${saved.phone}, otp: ${saved.otp}`);
            
            // Double-check by querying the database
            const verification = await OTP.findById(saved._id);
            console.log(`🔍 markAsUsed: Database verification - isUsed: ${verification.isUsed}`);
            
            return saved;
        } catch (error) {
            console.error(`❌ markAsUsed: Failed to save - Error:`, error);
            throw error;
        }
    }

    // Cleanup expired/used OTPs (can be called by cron job)
    async cleanupExpiredOTPs() {
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
            console.error('Get OTP stats error:', error);
            throw error;
        }
    }
}

module.exports = new OTPService();
