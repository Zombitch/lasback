import mongoose from 'mongoose';

const rankSchema = new mongoose.Schema(
  {
    // Source identification
    source: { type: String, trim: true, maxlength: 100 },
    version: { type: String, trim: true, maxlength: 50 },

    // User identification (keep anonymous — hash userId on client side if needed)
    userId: { type: String, trim: true, maxlength: 200 },

    // Parallel arrays — values[i] corresponds to labels[i]
    labels: [{ type: String, trim: true, maxlength: 100 }],
    values: [{ type: Number }],
  },
  {
    timestamps: true, // adds createdAt / updatedAt
  }
);

// Indexes for the most common query & aggregation patterns
rankSchema.index({ source: 1, createdAt: -1 });
rankSchema.index({ userId: 1 });

export const Rank = mongoose.model('Rank', rankSchema);
