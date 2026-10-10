import mongoose, { Schema } from "mongoose";
import type { MintOrder } from "@/lib/orders";

const OrderSchema = new Schema<MintOrder>(
  {
    token: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, max: 4 },
    amountSats: { type: Number, required: true },
    recipient: { type: String, required: true },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    status: {
      type: String,
      enum: ["awaiting_payment", "verified"],
      default: "awaiting_payment",
    },
    txid: { type: String, default: "" },
  },
  { versionKey: false }
);

export default mongoose.models.Order ?? mongoose.model<MintOrder>("Order", OrderSchema);
