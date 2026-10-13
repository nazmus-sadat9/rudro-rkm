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

    // Public stats for the progress bars.
    if (sp.get("stats") === "1") {
      const agg = await MintReservationModel.aggregate([
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

    // Public: look up your own reservation by its unguessable code (claim page).
    const code = sp.get("code");
    if (code !== null && code !== "") {
      const found = await MintReservationModel.findOne({ code: code.trim().toUpperCase() })
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
  const { code, handle, wallet, qty, tasks, handleVerified, createdAt } = b;

  if (typeof code !== "string" || !/^XC-[A-Z0-9]{6}$/.test(code.trim().toUpperCase()))
    return NextResponse.json({ error: "Missing reservation code" }, { status: 400 });
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

    const dup = await MintReservationModel.findOne({
      $or: [{ wallet: cleanWallet }, { handleLower }],
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
      { $group: { _id: null, pieces: { $sum: "$qty" } } },
    ]);
    const used: number = (agg[0]?.pieces ?? 0) + SITE.alreadyReserved;
    if (used >= SITE.totalSlots || used + (qty as number) > SITE.totalSlots)
      return NextResponse.json({ error: "Sold out — all 1,000 NFTs are taken." }, { status: 410 });

    await MintReservationModel.findOneAndUpdate(
      { code: (code as string).trim().toUpperCase() },
      {
        $setOnInsert: {
          code: (code as string).trim().toUpperCase(),
          handleLower,
          handle: `@${handleLower}`,
          wallet: cleanWallet,
          qty,
          handleVerified: handleVerified === true,
          createdAt,
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, code: (code as string).trim().toUpperCase() });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000)
      return NextResponse.json(
        { error: "This wallet or X handle already reserved." },
        { status: 409 }
      );
    return dbError();
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const code = req.nextUrl.searchParams.get("code");
    if (code === null || code === "")
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    await MintReservationModel.deleteOne({ code: code.trim().toUpperCase() });
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
