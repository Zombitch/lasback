import mongoose from 'mongoose';

const totpSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: 'admin',
    },
    secret: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export const Totp = mongoose.model('Totp', totpSchema);
