import mongoose from 'mongoose';

const visitSchema = new mongoose.Schema(
  {
    ip: String,
    agent: String,
    url: String,
    origin: String,
    lang: String
  },
  {
    timestamps: true, // adds createdAt / updatedAt
  }
);

export const Visit = mongoose.model('Visit', visitSchema);
