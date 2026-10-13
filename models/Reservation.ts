import mongoose, { Schema } from "mongoose";
import type { Reservation } from "@/lib/reservations";

const ReservationSchema = new Schema<Reservation>(
  {
    token: { type: String, required: true, unique: true },
    xHandle: { type: String, required: true },
    xHandleLower: { type: String, required: true, unique: true },
    wallet: { type: String, required: true, unique: true },
    quantity: { type: Number, required: true, min: 1, max: 4 },
    tasks: {
      follow: { type: Boolean, required: true },
      likeRepost: { type: Boolean, required: true },
      comment: { type: Boolean, required: true },
    },
    taskAt: {
      follow: { type: Number, default: 0 },
      likeRepost: { type: Number, default: 0 },
      comment: { type: Number, default: 0 },
    },
    createdAt: { type: Number, required: true },
  },
  { versionKey: false }
);

ReservationSchema.index({ createdAt: -1 });

export default mongoose.models.Reservation ??
  mongoose.model<Reservation>("Reservation", ReservationSchema);
