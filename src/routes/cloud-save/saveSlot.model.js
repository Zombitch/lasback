import mongoose from 'mongoose';

const saveSlotSchema = new mongoose.Schema(
  {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    slotKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    currentVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

saveSlotSchema.index({ gameId: 1, playerId: 1, slotKey: 1 }, { unique: true });
saveSlotSchema.index({ playerId: 1 });
saveSlotSchema.index({ gameId: 1, updatedAt: -1 });

export const SaveSlot = mongoose.model('SaveSlot', saveSlotSchema);
