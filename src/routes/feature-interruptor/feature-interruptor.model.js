import mongoose from 'mongoose';

const featureInterruptorSchema = new mongoose.Schema(
  {
    appId: {
      type: String,
      required: true,
      trim: true,
    },
    appName: {
      type: String,
      trim: true,
      default: '',
    },
    featureId: {
      type: String,
      required: true,
      trim: true,
    },
    featureName: {
      type: String,
      trim: true,
      default: '',
    },
    value: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// A feature is unique per app
featureInterruptorSchema.index({ appId: 1, featureId: 1 }, { unique: true });

export const FeatureInterruptor = mongoose.model(
  'FeatureInterruptor',
  featureInterruptorSchema
);
