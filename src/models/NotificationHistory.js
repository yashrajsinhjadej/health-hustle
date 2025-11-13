const mongoose = require("mongoose");

const notificationHistorySchema = new mongoose.Schema(
  {
    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NotificationSchedule",
      required: true,
    },
    firedAt: {
      type: Date,
      default: Date.now,
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
    status: {
      type: String,
      enum: ["sent", "partial_success", "failed"],
      default: "sent",
    },
    errorMessage: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("NotificationHistory", notificationHistorySchema);
