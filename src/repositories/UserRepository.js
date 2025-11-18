// src/repositories/UserRepository.js
const User = require('../models/User');

class UserRepository {
    
    // Find user by MongoDB _id
    static async findById(id) {
        return User.findById(id).lean();
    }

    // Find user by email
    static async findByEmail(email) {
        return User.findOne({ email }).lean();
    }

    // Create a new user
    static async create(data) {
        return User.create(data);
    }

    // Update user by id
    static async updateById(id, updateData) {
        return User.findByIdAndUpdate(id, updateData, { new: true }).lean();
    }

    // Check if user exists
    static async existsById(id) {
        return User.exists({ _id: id });
    }

    // Update user fields safely
    static async update(id, updateFields) {
        return User.findByIdAndUpdate(id, { $set: updateFields }, { new: true }).lean();
    }

    // Raw model access for advanced queries (aggregation, population)
    static model() {
        return User;
    }
}

module.exports = UserRepository;
