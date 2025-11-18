// src/repositories/GoalsRepository.js
const Goals = require('../models/Goals');

class GoalsRepository {

    // Get user goals
    static async findByUserId(userId) {
        return Goals.findOne({ userId }).lean();
    }

    // Raw model access
    static model() {
        return Goals;
    }
}

module.exports = GoalsRepository;
