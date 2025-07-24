const User = require('../models/User');


async function getUserProfile(req, res) {
    try {
        const user = req.user; // User object is set by authenticateToken middleware
        
        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                profileCompleted: user.profileCompleted,
                // Include profile data if available
                ...(user.profileCompleted && {
                    age: user.age,
                    gender: user.gender,
                    height: user.height,
                    weight: user.weight,
                    loyaltyPercentage: user.loyaltyPercentage,
                    bodyProfile: user.bodyProfile,
                    mainGoal: user.mainGoal,
                    sportsAmbitions: user.sportsAmbitions,
                    activityLevel: user.activityLevel
                })
            }
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}


async function updateUserProfile(req, res) {
    try {
        const user = req.user;

        // Check if profile is already completed
        if (user.profileCompleted === true) {
            return res.status(400).json({
                success: false,
                error: 'Profile already completed. Profile can only be updated once during initial setup.',
                message: 'Your profile has already been set up. Contact support if you need to make changes.'
            });
        }

        const {
            name,
            email,
            gender,
            height,
            weight,
            age,
            loyaltyPercentage,
            bodyProfile,
            mainGoal,
            sportsAmbitions
        } = req.body;

        // Validation object to track errors
        const validationErrors = {};

        // Validate required fields for profile completion
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            validationErrors.name = 'Name is required and must be a valid string';
        } else if (name.trim().length > 50) {
            validationErrors.name = 'Name cannot exceed 50 characters';
        }

        if (!email || typeof email !== 'string') {
            validationErrors.email = 'Email is required';
        } else {
            const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
            if (!emailRegex.test(email.toLowerCase())) {
                validationErrors.email = 'Please enter a valid email address';
            }
        }

        if (!gender || !['male', 'female', 'other'].includes(gender.toLowerCase())) {
            validationErrors.gender = 'Gender is required and must be male, female, or other';
        }

        if (!height || typeof height !== 'number') {
            validationErrors.height = 'Height is required and must be a number';
        } else if (height < 50 || height > 300) {
            validationErrors.height = 'Height must be between 50cm and 300cm';
        }

        if (!weight || typeof weight !== 'number') {
            validationErrors.weight = 'Weight is required and must be a number';
        } else if (weight < 10 || weight > 500) {
            validationErrors.weight = 'Weight must be between 10kg and 500kg';
        }

        if (!age || typeof age !== 'number') {
            validationErrors.age = 'Age is required and must be a number';
        } else if (age < 13 || age > 120) {
            validationErrors.age = 'Age must be between 13 and 120';
        }

        if (loyaltyPercentage === undefined || typeof loyaltyPercentage !== 'number') {
            validationErrors.loyaltyPercentage = 'Loyalty percentage is required and must be a number';
        } else if (loyaltyPercentage < 0 || loyaltyPercentage > 100) {
            validationErrors.loyaltyPercentage = 'Loyalty percentage must be between 0 and 100';
        } else if (loyaltyPercentage % 10 !== 0) {
            validationErrors.loyaltyPercentage = 'Loyalty percentage must be in intervals of 10 (0, 10, 20, ..., 100)';
        }

        if (!bodyProfile || !['slim', 'average', 'muscular', 'overweight'].includes(bodyProfile.toLowerCase())) {
            validationErrors.bodyProfile = 'Body profile is required and must be slim, average, muscular, or overweight';
        }

        if (!mainGoal || !['weight_loss', 'build_muscles', 'full_body_detox', 'fit_body'].includes(mainGoal.toLowerCase())) {
            validationErrors.mainGoal = 'Main goal is required and must be weight_loss, build_muscles, full_body_detox, or fit_body';
        }

        // Validate sports ambitions (optional but must be valid if provided)
        if (sportsAmbitions && Array.isArray(sportsAmbitions)) {
            const allowedSports = ['swimming', 'badminton', 'table_tennis', 'boxing', 'running', 'cycling'];
            const invalidSports = sportsAmbitions.filter(sport => 
                !allowedSports.includes(sport.toLowerCase())
            );
            if (invalidSports.length > 0) {
                validationErrors.sportsAmbitions = `Invalid sports: ${invalidSports.join(', ')}. Allowed: ${allowedSports.join(', ')}`;
            }
        } else if (sportsAmbitions && !Array.isArray(sportsAmbitions)) {
            validationErrors.sportsAmbitions = 'Sports ambitions must be an array';
        }

        // If validation errors exist, return them
        if (Object.keys(validationErrors).length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                validationErrors: validationErrors
            });
        }

        // Prepare update data with only allowed fields
        const updateData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            gender: gender.toLowerCase(),
            height: height,
            weight: weight,
            age: age,
            loyaltyPercentage: loyaltyPercentage,
            bodyProfile: bodyProfile.toLowerCase(),
            mainGoal: mainGoal.toLowerCase(),
            sportsAmbitions: sportsAmbitions ? sportsAmbitions.map(sport => sport.toLowerCase()) : [],
            profileCompleted: true // Mark profile as completed
        };

        // Update user with validation
        const userUpdated = await User.findByIdAndUpdate(
            user._id, 
            updateData,
            { 
                new: true, // Return updated document
                runValidators: true // Run mongoose validators
            }
        );

        if (!userUpdated) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log(`👤 Profile completed for user ${userUpdated._id} - ${userUpdated.name}`);

        res.json({
            success: true,
            message: 'User profile updated successfully',
            user: {
                id: userUpdated._id,
                name: userUpdated.name,
                phone: userUpdated.phone,
                email: userUpdated.email,
                profileCompleted: userUpdated.profileCompleted,
                age: userUpdated.age,
                gender: userUpdated.gender,
                bodyProfile: userUpdated.bodyProfile,
                mainGoal: userUpdated.mainGoal
            }
        });

    } catch (error) {
        console.error('Update user profile error:', error);
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = {};
            Object.keys(error.errors).forEach(key => {
                validationErrors[key] = error.errors[key].message;
            });
            
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                validationErrors: validationErrors
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}


module.exports = {
    getUserProfile,
    updateUserProfile
};