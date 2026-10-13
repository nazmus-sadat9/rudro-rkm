import mongoose, { Schema } from "mongoose";

export interface MintReservationDoc {
  /** Reservation code, e.g. XC-AB12CD. Also the record id. */
  code: string;
  /** X handle without @, lowercased — one per reservation. */
  handleLower: string;
  /** Display handle with @. */
  handle: string;
  /** EVM (0x…) or Solana wallet — one per reservation. */
  wallet: string;
  qty: number;
  handleVerified: boolean;
  createdAt: number;
}

const MintReservationSchema = new Schema<MintReservationDoc>(
  {
    code: { type: String, required: true, unique: true },
    handleLower: { type: String, required: true, unique: true },
    handle: { type: String, required: true },
    wallet: { type: String, required: true, unique: true },
    qty: { type: Number, required: true, min: 1, max: 4 },
    handleVerified: { type: Boolean, default: false },
    createdAt: { type: Number, required: true },
  },
  { versionKey: false }
);

MintReservationSchema.index({ createdAt: -1 });

export default mongoose.models.MintReservation ??
  mongoose.model<MintReservationDoc>("MintReservation", MintReservationSchema, "mint_reservations");
