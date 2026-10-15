import mongoose, { Schema } from "mongoose";

export type ReservationStatus = "pending" | "accepted" | "rejected";

export interface MintReservationDoc {
  /** X handle without @, lowercased — one per reservation. */
  handleLower: string;
  /** Display handle with @. */
  handle: string;
  /** EVM (0x…) or Solana wallet — one per reservation. Also the record id. */
  wallet: string;
  qty: number;
  handleVerified: boolean;
  /** Review state. Rejected reservations free their slot. */
  status: ReservationStatus;
  createdAt: number;
}

const MintReservationSchema = new Schema<MintReservationDoc>(
  {
    handleLower: { type: String, required: true, unique: true },
    handle: { type: String, required: true },
    wallet: { type: String, required: true, unique: true },
    qty: { type: Number, required: true, min: 1, max: 4 },
    handleVerified: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    createdAt: { type: Number, required: true },
  },
  { versionKey: false }
);

MintReservationSchema.index({ createdAt: -1 });

export default mongoose.models.MintReservation ??
  mongoose.model<MintReservationDoc>("MintReservation", MintReservationSchema, "mint_reservations");
