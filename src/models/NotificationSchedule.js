// models/NotificationSchedule.js
const mongoose = require("mongoose");

// Simple URL validator to avoid storing unsafe strings in `icon`
const isValidUrl = (value) => {
  if (!value) return true; // allow empty (since optional)
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
};

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

    // Notification type
    notificationType: {
      type: String,
      enum: [
        "workout",
        "reminder",
        "message",
        "system_alert",
        "nutrition",
        "challenge",
        "promotion",
        "update",
      ],
      default: "reminder"
      // ❌ removed index:true (duplicate)
    },

    icon: {
      type: String,
      trim: true,
      validate: {
        validator: isValidUrl,
        message: "icon must be a valid http(s) URL",
      },
    },

    category: {
      type: String,
      trim: true,
      enum: ["Workout", "Remainder", "Progress", "General", "Motivational"],
      maxlength: 50,
      default: "General",
    },

    scheduleType: {
      type: String,
      enum: ["instant", "scheduled_once", "daily"],
      default: "instant",
    },

    scheduledTime: {
      type: String, // "HH:mm"
      required: function () {
        return this.scheduleType === "daily";
      },
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
        },
        message: "scheduledTime must be in HH:mm (24h) format",
      },
    },

    scheduledDate: {
      type: Date,
      required: function () {
        return this.scheduleType === "scheduled_once";
      },
    },

    targetAudience: {
      type: String,
      enum: ["all", "filtered"],
      default: "all"
      // ❌ removed index:true (duplicate)
    },

    filters: {
      gender: {
        type: [String],
        enum: ["male", "female", "other"],
        default: undefined,
      },
      platform: {
        type: [String],
        enum: ["android", "ios", "web"],
        default: undefined,
      },
      ageRange: {
        min: { type: Number, min: 13, max: 120 },
        max: { type: Number, min: 13, max: 120 },
      },
    },

    status: {
      type: String,
      enum: ["pending", "active", "completed", "failed", "partial_success", "paused"],
      default: "pending"
      // ❌ removed index:true (duplicate)
    },

    lastRunStatus: {
      type: String,
      enum: ["completed", "partial_success", "failed"],
    },

    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    sentAt: { type: Date },

    totalTargeted: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    failureReason: { type: String },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
      // ❌ removed index:true (duplicate)
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// =========================
// 🔥 OPTIMIZED INDEXES HERE
// =========================
notificationScheduleSchema.index({ scheduleType: 1, status: 1 });
notificationScheduleSchema.index({ createdBy: 1 });
notificationScheduleSchema.index({ scheduledDate: 1 });
notificationScheduleSchema.index({ targetAudience: 1 });
notificationScheduleSchema.index({ notificationType: 1 });

// Validation for filtered audience
notificationScheduleSchema.pre("validate", function (next) {
  if (this.targetAudience === "filtered") {
    const hasAnyFilter =
      (this.filters?.gender && this.filters.gender.length > 0) ||
      (this.filters?.platform && this.filters.platform.length > 0) ||
      (typeof this.filters?.ageRange?.min === "number" &&
        typeof this.filters?.ageRange?.max === "number");

    if (!hasAnyFilter) {
      return next(new Error("filters must be provided when targetAudience is 'filtered'"));
    }
  }
  next();
});

module.exports = mongoose.model("NotificationSchedule", notificationScheduleSchema);
