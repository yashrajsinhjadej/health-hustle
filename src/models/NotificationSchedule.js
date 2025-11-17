// models/NotificationSchedule.js
const mongoose = require("mongoose");

// Simple URL validator to avoid storing unsafe strings in `icon`
// Adjust if you want to accept data URIs or S3 keys instead of full URLs.
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

    // NEW: Notification type definition
    // A categorical type to differentiate notifications semantically
    notificationType: {
      type: String,
      enum: [
        "workout",          // e.g., Workout plans or session reminders
        "reminder",         // generic reminders
        "message",          // direct/user messages
        "system_alert",     // system-wide alerts or maintenance
        "nutrition",        // meal plans, calorie tracking
        "challenge",        // fitness challenges, badges
        "promotion",        // marketing/promotional
        "update",           // app updates or feature announcements
      ],
      default: "reminder",
      index: true, // helpful for analytics/filtering
    },

    // Optional icon URL to visually represent the type
    icon: {
      type: String,
      trim: true,
      validate: {
        validator: isValidUrl,
        message: "icon must be a valid http(s) URL",
      },
    },

    // Optional category  to display a friendly tag
    // e.g., "Workout", "Reminder", "Message", "System Alert"
    category: {
      type: String,
      trim: true,
      enum: ["Workout", "Remainder","Progress","General","Motivational"],
      maxlength: 50,
      default: "General",
    },

    scheduleType: {
      type: String,
      enum: ["instant", "scheduled_once", "daily"],
      default: "instant",
    },
    scheduledTime: {
      type: String, // Format: "HH:mm" (e.g., "09:00")
      required: function () {
        return this.scheduleType === "daily";
      },
      validate: {
        validator: function (v) {
          if (!v) return true;
          // Basic HH:mm 24h format check
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
      default: "all",
      index: true,
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
        min: {
          type: Number,
          min: 13,
          max: 120,
        },
        max: {
          type: Number,
          min: 13,
          max: 120,
        },
      },
    },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "failed", "partial_success", "paused"],
      default: "pending",
      index: true,
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
      index: true,
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
notificationScheduleSchema.index({ targetAudience: 1 });
notificationScheduleSchema.index({ notificationType: 1 }); 

// Optional: if targetAudience is "filtered", ensure filters exist
notificationScheduleSchema.pre("validate", function (next) {
  if (this.targetAudience === "filtered") {
    const hasAnyFilter =
      (this.filters?.gender && this.filters.gender.length > 0) ||
      (this.filters?.platform && this.filters.platform.length > 0) ||
      (typeof this.filters?.ageRange?.min === "number" && typeof this.filters?.ageRange?.max === "number");
    if (!hasAnyFilter) {
      return next(new Error("filters must be provided when targetAudience is 'filtered'"));
    }
  }
  next();
});

module.exports = mongoose.model("NotificationSchedule", notificationScheduleSchema);
