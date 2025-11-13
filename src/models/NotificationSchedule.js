// models/NotificationSchedule.js
const mongoose = require("mongoose");

const notificationScheduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    scheduleType: {
      type: String,
      enum: ["instant", "scheduled_once", "daily"],
      default: "instant",
    },
    scheduledTime: {
      type: String, // Format: "HH:mm" (e.g., "09:00")
      required: function() {
        return this.scheduleType === "daily";
      },
    },
    scheduledDate: {
      type: Date,
      required: function() {
        return this.scheduleType === "scheduled_once";
      },
    },
    targetAudience: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    filters: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "failed", "partial_success", "paused"],
      default: "pending",
    },
    // For daily schedules - track last run
    lastRunStatus: {
      type: String,
      enum: ["completed", "partial_success", "failed"],
    },
    lastRunAt: {
      type: Date,
    },
    nextRunAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    totalTargeted: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    failureReason: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
notificationScheduleSchema.index({ scheduleType: 1, status: 1 });
notificationScheduleSchema.index({ createdBy: 1 });
notificationScheduleSchema.index({ scheduledDate: 1 });

module.exports = mongoose.model("NotificationSchedule", notificationScheduleSchema);