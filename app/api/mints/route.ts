import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import MintReservationModel from "@/models/MintReservation";
import { SITE } from "@/lib/config";

const XHANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await connectDB();
  } catch {
    return dbError();
  }
  try {
    const sp = req.nextUrl.searchParams;

    // Public stats for the progress bars (rejected reservations free their slot).
    if (sp.get("stats") === "1") {
      const agg = await MintReservationModel.aggregate([
        { $match: { status: { $ne: "rejected" } } },
        { $group: { _id: null, pieces: { $sum: "$qty" }, count: { $sum: 1 } } },
      ]);
      const pieces: number = agg[0]?.pieces ?? 0;
      const count: number = agg[0]?.count ?? 0;
      const remaining = Math.max(0, SITE.totalSlots - SITE.alreadyReserved - pieces);
      return NextResponse.json({ count, pieces, remaining, soldOut: remaining <= 0 });
    }

    // Admin: full list, newest first.
    if (isAdmin(req)) {
      const all = await MintReservationModel.find()
        .sort({ createdAt: -1 })
        .select("-_id -__v")
        .lean();
      return NextResponse.json(all);
    }

    // Public: look up your own reservation by wallet (claim page).
    const wallet = sp.get("wallet");
    if (wallet !== null && wallet !== "") {
      const found = await MintReservationModel.findOne({ wallet: wallet.trim() })
        .select("-_id -__v")
        .lean();
      return NextResponse.json(found !== null ? [found] : []);
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
  if (typeof body !== "object" || body === null)
    return NextResponse.json({ error: "Invalid reservation" }, { status: 400 });

  const b = body as Record<string, unknown>;
  const { handle, wallet, qty, tasks, handleVerified, createdAt } = b;

  if (typeof handle !== "string" || !XHANDLE_RE.test(handle.trim()))
    return NextResponse.json(
      { error: "Enter a valid X handle (1-15 chars, letters/numbers/_)." },
      { status: 400 }
    );
  const cleanWallet = typeof wallet === "string" ? wallet.trim() : "";
  if (!EVM_RE.test(cleanWallet) && !SOL_RE.test(cleanWallet))
    return NextResponse.json({ error: "Enter a valid wallet address." }, { status: 400 });
  if (
    typeof qty !== "number" ||
    !Number.isInteger(qty) ||
    qty < 1 ||
    qty > SITE.maxPerWallet
  )
    return NextResponse.json({ error: `Quantity must be 1-${SITE.maxPerWallet}.` }, { status: 400 });

  const t = tasks as Record<string, unknown> | undefined;
  if (
    t === undefined ||
    t === null ||
    t.follow !== true ||
    t.like !== true ||
    t.rt !== true ||
    t.cmt !== true
  )
    return NextResponse.json({ error: "Complete all X tasks first." }, { status: 400 });
  if (typeof createdAt !== "number")
    return NextResponse.json({ error: "Invalid reservation" }, { status: 400 });

  const handleLower = (handle as string).trim().replace(/^@/, "").toLowerCase();

  try {
    await connectDB();

    // Rejected reservations don't block — their slot was freed.
    const dup = await MintReservationModel.findOne({
      $or: [{ wallet: cleanWallet }, { handleLower }],
      status: { $ne: "rejected" },
    })
      .select("wallet handleLower")
      .lean();
    if (dup !== null) {
      if ((dup as { wallet?: string }).wallet === cleanWallet)
        return NextResponse.json(
          { error: "This wallet already reserved. One reservation per wallet." },
          { status: 409 }
        );
      return NextResponse.json(
        { error: "This X handle already reserved. One reservation per handle." },
        { status: 409 }
      );
    }

    const agg = await MintReservationModel.aggregate([
      { $match: { status: { $ne: "rejected" } } },
      { $group: { _id: null, pieces: { $sum: "$qty" } } },
    ]);
    const used: number = (agg[0]?.pieces ?? 0) + SITE.alreadyReserved;
    if (used >= SITE.totalSlots || used + (qty as number) > SITE.totalSlots)
      return NextResponse.json({ error: "Sold out — all 1,000 NFTs are taken." }, { status: 410 });

    // Re-reserving after a rejection refreshes the row back to pending.
    await MintReservationModel.findOneAndUpdate(
      { wallet: cleanWallet },
      {
        $set: {
          handleLower,
          handle: `@${handleLower}`,
          qty,
          handleVerified: handleVerified === true,
          status: "pending",
          createdAt,
        },
        $setOnInsert: { wallet: cleanWallet },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, wallet: cleanWallet, status: "pending" });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000)
      return NextResponse.json(
        { error: "This wallet or X handle already reserved." },
        { status: 409 }
      );
    return dbError();
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { wallet, status } = body as Record<string, unknown>;
  if (typeof wallet !== "string" || wallet.trim() === "")
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  if (status !== "pending" && status !== "accepted" && status !== "rejected")
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  try {
    await connectDB();
    const updated = await MintReservationModel.findOneAndUpdate(
      { wallet: wallet.trim() },
      { $set: { status } },
      { new: true }
    )
      .select("-_id -__v")
      .lean();
    if (updated === null)
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return dbError();
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (wallet === null || wallet === "")
      return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    await MintReservationModel.deleteOne({ wallet: wallet.trim() });
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
