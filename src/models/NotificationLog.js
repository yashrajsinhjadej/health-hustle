const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationLogSchema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationSchedule', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  sentAt: { type: Date },
  failureReason: { type: String },
  deviceToken: { type: String },
}, { timestamps: true });

notificationLogSchema.index({ userId: 1, createdAt: -1 });
notificationLogSchema.index({ scheduleId: 1 });
notificationLogSchema.index({ userId: 1, sentAt: -1, _id: -1 });

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
