import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

playerSchema.index({ email: 1 });
playerSchema.index({ username: 1 });

export const Player = mongoose.model('Player', playerSchema);
