import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ReservationModel from "@/models/Reservation";
import { MAX_PER_WALLET, SUPPLY_LIMIT } from "@/lib/quest";

const BC1P_RE = /^bc1p[023456789ac-hj-np-z]{58}$/;
const XHANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;

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

function normalizeHandle(raw: string): { display: string; lower: string } | null {
  const v = raw.trim();
  if (!XHANDLE_RE.test(v)) return null;
  const display = v.startsWith("@") ? v : `@${v}`;
  const lower = v.replace(/^@/, "").toLowerCase();
  return { display, lower };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await connectDB();
  } catch {
    return dbError();
  }
  try {
    const sp = req.nextUrl.searchParams;

    // Public stats for the homepage progress bar.
    if (sp.get("stats") === "1") {
      const agg = await ReservationModel.aggregate([
        { $group: { _id: null, pieces: { $sum: "$quantity" }, count: { $sum: 1 } } },
      ]);
      const pieces: number = agg[0]?.pieces ?? 0;
      const count: number = agg[0]?.count ?? 0;
      const remaining = Math.max(0, SUPPLY_LIMIT - pieces);
      return NextResponse.json({
        count,
        pieces,
        remaining,
        soldOut: remaining <= 0,
      });
    }

    // Public: look up your own reservation by its unguessable token.
    const token = sp.get("token");
    if (token !== null && token !== "") {
      const found = await ReservationModel.findOne({ token }).select("-_id -__v").lean();
      return NextResponse.json(found !== null ? [found] : []);
    }

    if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const all = await ReservationModel.find().sort({ createdAt: -1 }).select("-_id -__v").lean();
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
  if (typeof body !== "object" || body === null)
    return NextResponse.json({ error: "Invalid reservation" }, { status: 400 });

  const b = body as Record<string, unknown>;
  const { token, xHandle, wallet, quantity, tasks, createdAt } = b;

  if (typeof token !== "string" || token === "")
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  if (typeof xHandle !== "string" || normalizeHandle(xHandle) === null)
    return NextResponse.json(
      { error: "Enter a valid X handle (1-15 chars, letters/numbers/_)." },
      { status: 400 }
    );
  if (typeof wallet !== "string" || !BC1P_RE.test(wallet.trim()))
    return NextResponse.json({ error: "Enter a valid bc1p Taproot address." }, { status: 400 });
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_PER_WALLET
  )
    return NextResponse.json({ error: `Quantity must be 1-${MAX_PER_WALLET}.` }, { status: 400 });

  const t = tasks as Record<string, unknown> | undefined;
  if (
    t === undefined ||
    t === null ||
    t.follow !== true ||
    t.likeRepost !== true ||
    t.comment !== true
  )
    return NextResponse.json({ error: "Complete all X tasks first." }, { status: 400 });
  // Guided-verify timestamps (lite): accepted as evidence, not API-checked.
  const stamps = (b.taskAt ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const taskAt = { follow: num(stamps.follow), likeRepost: num(stamps.likeRepost), comment: num(stamps.comment) };
  if (typeof createdAt !== "number")
    return NextResponse.json({ error: "Invalid reservation" }, { status: 400 });

  const norm = normalizeHandle(xHandle as string);
  if (norm === null) return NextResponse.json({ error: "Invalid X handle." }, { status: 400 });
  const cleanWallet = (wallet as string).trim();

  try {
    await connectDB();

    // One wallet = one reservation. One X handle = one reservation.
    const dup = await ReservationModel.findOne({
      $or: [{ wallet: cleanWallet }, { xHandleLower: norm.lower }],
    })
      .select("wallet xHandleLower")
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

    // 1000-slot cap (sum of quantities).
    const agg = await ReservationModel.aggregate([
      { $group: { _id: null, pieces: { $sum: "$quantity" } } },
    ]);
    const used: number = agg[0]?.pieces ?? 0;
    if (used + (quantity as number) > SUPPLY_LIMIT)
      return NextResponse.json({ error: "Sold out — all 1,000 slots are taken." }, { status: 410 });
    if (used >= SUPPLY_LIMIT)
      return NextResponse.json({ error: "Sold out — all 1,000 slots are taken." }, { status: 410 });

    await ReservationModel.findOneAndUpdate(
      { token: String(token) },
      {
        $setOnInsert: {
          token: String(token),
          xHandle: norm.display,
          xHandleLower: norm.lower,
          wallet: cleanWallet,
          quantity,
          tasks: { follow: true, likeRepost: true, comment: true },
          taskAt,
          createdAt,
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, token: String(token) });
  } catch (err: unknown) {
    // Unique-index race: surface as duplicate, not 500.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: number }).code === 11000
    )
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
    const token = req.nextUrl.searchParams.get("token");
    if (token !== null && token !== "") await ReservationModel.deleteOne({ token });
    else await ReservationModel.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
