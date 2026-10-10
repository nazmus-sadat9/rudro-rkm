import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";

const isAdmin = (r: NextRequest) =>
  !!process.env.ADMIN_CODE && r.headers.get("x-admin-code") === process.env.ADMIN_CODE;

export async function GET(req: NextRequest) {
  await connectDB();
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const o = await Order.findOne({ token }).select("-_id -__v").lean();
    return NextResponse.json(o ? [o] : []);
  }
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const all = await Order.find().sort({ createdAt: -1 }).select("-_id -__v").lean();
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  await connectDB();
  const b = await req.json();
  if (!b.token || !/^bc1p[a-z0-9]{50,}$/.test(b.address ?? "") || !(b.quantity >= 1 && b.quantity <= 4))
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const data = {
    address: b.address, quantity: b.quantity, amountSats: b.amountSats,
    recipient: b.recipient, createdAt: b.createdAt, expiresAt: b.expiresAt,
  };
  // only admin can change status/txid
  const update = isAdmin(req)
    ? { $set: { ...data, status: b.status, txid: b.txid } }
    : { $set: data, $setOnInsert: { status: "awaiting_payment", txid: "" } };

  await Order.findOneAndUpdate({ token: b.token }, update, { upsert: true });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const token = req.nextUrl.searchParams.get("token");
  if (token) await Order.deleteOne({ token });
  else await Order.deleteMany({});
  return NextResponse.json({ ok: true });
}
