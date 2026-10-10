import { NextResponse } from "next/server";

/**
 * Database-backed order API — NOT YET CONNECTED (stub).
 *
 * To go live:
 *   1. Add your database client (e.g. Prisma, Drizzle, or pg) and a
 *      `MintOrder` table matching `lib/orders.ts`.
 *   2. Implement GET (list), POST (upsert), DELETE (remove) below.
 *   3. Set `USE_API = true` in `lib/orders.ts`.
 *
 * Until then every handler returns 501 so the UI keeps using the local
 * demo store and nothing silently half-works.
 */

const NOT_CONNECTED = {
  error: "database_not_connected",
  hint: "Implement app/api/orders/route.ts against your database, then set USE_API = true in lib/orders.ts.",
};

export async function GET() {
  return NextResponse.json(NOT_CONNECTED, { status: 501 });
}

export async function POST() {
  return NextResponse.json(NOT_CONNECTED, { status: 501 });
}

export async function DELETE() {
  return NextResponse.json(NOT_CONNECTED, { status: 501 });
}
