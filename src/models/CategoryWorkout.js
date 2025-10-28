const mongoose = require('mongoose');

const CategoryWorkoutSchema = new mongoose.Schema({
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', required: true },
  sequence: { type: Number, required: true, default: 1 },
  isActive: { type: Boolean, default: true }, // ✅ Added soft delete support
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Prevent duplicate workout in same category
CategoryWorkoutSchema.index({ categoryId: 1, workoutId: 1 }, { unique: true });

// Fast sorting inside each category
CategoryWorkoutSchema.index({ categoryId: 1, sequence: 1 });

module.exports = mongoose.model('CategoryWorkout', CategoryWorkoutSchema);
