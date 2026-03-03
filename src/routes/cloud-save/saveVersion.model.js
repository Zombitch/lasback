import mongoose from 'mongoose';

const saveVersionSchema = new mongoose.Schema(
  {
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SaveSlot',
      required: true,
    },
    version: { type: Number, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    payloadHash: { type: String },
    clientBuild: { type: String, trim: true, maxlength: 100 },
  },
  { timestamps: true },
);

saveVersionSchema.index({ slotId: 1, version: -1 });
saveVersionSchema.index({ createdAt: -1 });

export const SaveVersion = mongoose.model('SaveVersion', saveVersionSchema);
