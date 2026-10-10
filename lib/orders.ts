/**
 * Order storage seam.
 *
 * Today this is a localStorage-backed store so the claim demo works with
 * no backend. When you are ready to connect a database:
 *
 *   1. Create your table (e.g. Postgres via Prisma/Drizzle) with the
 *      `MintOrder` shape below.
 *   2. Implement the matching handlers in `app/api/orders/route.ts`.
 *   3. Flip `USE_API` to `true` — the claim page and the admin dashboard
 *      both read/write through this module, so no UI changes are needed.
 */

export type OrderStatus = "awaiting_payment" | "verified";

export interface MintOrder {
  /** Private order recovery code (also the record id). */
  token: string;
  /** Customer bc1p delivery address. */
  address: string;
  quantity: number;
  amountSats: number;
  recipient: string;
  createdAt: number;
  expiresAt: number;
  status: OrderStatus;
  txid: string;
}

/** Set to `true` once `app/api/orders` is backed by a real database. */
export const USE_API = false;

const STORAGE_KEY = "quiet-mint:orders:v1";

function readLocal(): MintOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MintOrder[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(orders: MintOrder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

async function readApi(): Promise<MintOrder[]> {
  const res = await fetch("/api/orders", { cache: "no-store" });
  if (!res.ok) throw new Error("Order API unavailable");
  return (await res.json()) as MintOrder[];
}

export function listOrders(): MintOrder[] {
  if (USE_API) throw new Error("Use listOrdersAsync() when USE_API is true");
  return readLocal().sort((a, b) => b.createdAt - a.createdAt);
}

export async function listOrdersAsync(): Promise<MintOrder[]> {
  if (!USE_API) return listOrders();
  return readApi();
}

export function saveOrder(order: MintOrder): void {
  if (USE_API) throw new Error("Use saveOrderAsync() when USE_API is true");
  const rest = readLocal().filter((o) => o.token !== order.token);
  writeLocal([order, ...rest].slice(0, 50));
}

export async function saveOrderAsync(order: MintOrder): Promise<void> {
  if (!USE_API) return saveOrder(order);
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(order),
  });
  if (!res.ok) throw new Error("Could not save order");
}

export function removeOrder(token: string): void {
  writeLocal(readLocal().filter((o) => o.token !== token));
}

export function clearOrders(): void {
  writeLocal([]);
}
