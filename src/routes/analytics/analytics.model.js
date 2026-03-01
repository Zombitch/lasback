import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    // Source identification
    source: { type: String, trim: true, maxlength: 100 },
    version: { type: String, trim: true, maxlength: 50 },

    // User identification (keep anonymous — hash userId on client side if needed)
    userId: { type: String, trim: true, maxlength: 200 },
    sessionId: { type: String, trim: true, maxlength: 200 },

    // Request context (auto-filled server-side)
    ip: { type: String },
    country: { type: String, maxlength: 5 }, // ISO 3166-1 alpha-2 (ex: "FR")
    userAgent: { type: String, maxlength: 500 },

    // Device / platform
    platform: { type: String, trim: true, maxlength: 50 }, // web, mobile, desktop, console...

    // Action tracking
    action: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, trim: true, maxlength: 100 }, // gameplay, ui, shop, auth...

    // Optional numeric / timing data
    value: { type: Number },
    duration: { type: Number }, // duration in ms

    // Flexible payload (arbitrary key-value store)
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
  }
);

// Indexes for the most common query & aggregation patterns
eventSchema.index({ source: 1, createdAt: -1 });
eventSchema.index({ action: 1 });
eventSchema.index({ userId: 1 });
eventSchema.index({ country: 1 });
eventSchema.index({ createdAt: -1 });

export const Event = mongoose.model('Event', eventSchema);
