import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import type { OrderStatus } from "@/lib/orders";

/** Same rule as the claim form: mainnet Taproot address, 62 chars total. */
const BC1P_RE = /^bc1p[023456789ac-hj-np-z]{58}$/;
const TXID_RE = /^(0x)?[a-f0-9]{64}$/i;

const isAdmin = (req: NextRequest): boolean =>
  process.env.ADMIN_CODE !== undefined &&
  process.env.ADMIN_CODE !== "" &&
  req.headers.get("x-admin-code") === process.env.ADMIN_CODE;

function dbError(): NextResponse {
  return NextResponse.json(
    { error: "database_unavailable", hint: "MONGODB_URI missing or MongoDB unreachable." },
    { status: 500 }
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await connectDB();
  } catch {
    return dbError();
  }
  try {
    // Public: look up your own order by its unguessable recovery token.
    const token: string | null = req.nextUrl.searchParams.get("token");
    if (token !== null && token !== "") {
      const found = await Order.findOne({ token }).select("-_id -__v").lean();
      return NextResponse.json(found !== null ? [found] : []);
    }
    if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const all = await Order.find().sort({ createdAt: -1 }).select("-_id -__v").lean();
    return NextResponse.json(all);
  } catch {
    return dbError();
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const { token, address, quantity, amountSats, recipient, createdAt, expiresAt } = body;
  const valid: boolean =
    typeof token === "string" &&
    token !== "" &&
    typeof address === "string" &&
    BC1P_RE.test(address) &&
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 4 &&
    typeof amountSats === "number" &&
    Number.isFinite(amountSats) &&
    amountSats > 0 &&
    typeof recipient === "string" &&
    recipient !== "" &&
    typeof createdAt === "number" &&
    typeof expiresAt === "number" &&
    expiresAt > createdAt;
  if (!valid) return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const admin: boolean = isAdmin(req);
  const data = { address, quantity, amountSats, recipient, createdAt, expiresAt };

  // Only admin can set delivery status / tx hash; everyone else gets the
  // safe defaults on insert and can never overwrite them afterwards.
  let update: Record<string, unknown>;
  if (admin) {
    const status: OrderStatus = body.status === "verified" ? "verified" : "awaiting_payment";
    const txid: string =
      typeof body.txid === "string" && TXID_RE.test(body.txid) ? body.txid.toLowerCase() : "";
    update = { $set: { ...data, status, txid } };
  } else {
    update = { $set: data, $setOnInsert: { status: "awaiting_payment", txid: "" } };
  }

  try {
    await connectDB();
    await Order.findOneAndUpdate({ token: String(token) }, update, { upsert: true });
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const token: string | null = req.nextUrl.searchParams.get("token");
    if (token !== null && token !== "") await Order.deleteOne({ token });
    else await Order.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
