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

const adminHeaders = (code: string): HeadersInit => ({
  "content-type": "application/json",
  "x-admin-code": code,
});

/* claim page */

export async function saveOrderAsync(order: MintOrder): Promise<void> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(order),
  });
  if (!res.ok) throw new Error("Could not save order");
}

export async function getOrder(token: string): Promise<MintOrder | null> {
  const res = await fetch(`/api/orders?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Order API unavailable");
  const list = (await res.json()) as MintOrder[];
  return list[0] ?? null;
}

/* Admin */

export async function listOrdersAdmin(code: string): Promise<MintOrder[]> {
  const res = await fetch("/api/orders", {
    cache: "no-store",
    headers: adminHeaders(code),
  });
  if (!res.ok) throw new Error("Unauthorized");
  return (await res.json()) as MintOrder[];
}

export async function saveOrderAdmin(order: MintOrder, code: string): Promise<void> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: adminHeaders(code),
    body: JSON.stringify(order),
  });
  if (!res.ok) throw new Error("Could not update order");
}

export async function removeOrderAdmin(token: string, code: string): Promise<void> {
  const res = await fetch(`/api/orders?token=${encodeURIComponent(token)}`, {
    method: "DELETE",
    headers: adminHeaders(code),
  });
  if (!res.ok) throw new Error("Could not delete order");
}

export async function clearOrdersAdmin(code: string): Promise<void> {
  const res = await fetch("/api/orders", {
    method: "DELETE",
    headers: adminHeaders(code),
  });
  if (!res.ok) throw new Error("Could not clear orders");
}
