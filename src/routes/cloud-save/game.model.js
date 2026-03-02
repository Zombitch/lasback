import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

export const Game = mongoose.model('Game', gameSchema);
