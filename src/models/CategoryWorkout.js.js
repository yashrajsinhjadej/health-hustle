const mongoose = require('mongoose');

const CategoryWorkoutSchema = new mongoose.Schema({
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', required: true },
  sequence: { type: Number, required: true, default: 1 }, // order inside category
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure no duplicate workout in the same category
CategoryWorkoutSchema.index({ categoryId: 1, workoutId: 1 }, { unique: true });

// Optional index for fast sorting in category
CategoryWorkoutSchema.index({ categoryId: 1, sequence: 1 });

module.exports = mongoose.model('CategoryWorkout', CategoryWorkoutSchema);
