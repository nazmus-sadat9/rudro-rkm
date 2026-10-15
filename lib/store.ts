import type { Reservation, ReservationStatus } from "./config";
import { SITE } from "./config";

const KEY = "xpromo_reservations_v1";

export function loadReservations(): Reservation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveReservation(r: Reservation) {
  const all = loadReservations();
  const i = all.findIndex((x) => x.wallet === r.wallet);
  if (i >= 0) all[i] = r;
  else all.push(r);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function localReservedSum(): number {
  return loadReservations().reduce((s, r) => s + r.qty, 0);
}

export function totalReserved(): number {
  return SITE.alreadyReserved + localReservedSum();
}

export function slotsLeft(): number {
  return Math.max(0, SITE.totalSlots - totalReserved());
}

export const normHandle = (h: string) => h.trim().replace(/^@/, "").toLowerCase();
export const validHandle = (h: string) => /^[a-z0-9_]{1,15}$/i.test(normHandle(h));

export function validWallet(w: string): boolean {
  w = w.trim();
  const evm = /^0x[a-fA-F0-9]{40}$/.test(w);
  const sol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w);
  return evm || sol;
}

export interface MintStats {
  count: number;
  pieces: number;
  remaining: number;
  soldOut: boolean;
}

export async function getMintStats(): Promise<MintStats> {
  const res = await fetch("/api/mints?stats=1", { cache: "no-store" });
  if (!res.ok) throw new Error("Stats unavailable");
  return (await res.json()) as MintStats;
}

export async function createMintReservation(input: {
  handle: string;
  wallet: string;
  qty: number;
  tasks: { follow: boolean; like: boolean; rt: boolean; cmt: boolean };
  handleVerified: boolean;
  createdAt: number;
}): Promise<{ wallet: string }> {
  const res = await fetch("/api/mints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const raw = await res.text().catch(() => "");
  let data: { error?: string; wallet?: string } = {};
  try {
    data = (JSON.parse(raw) as { error?: string; wallet?: string }) ?? {};
  } catch {
    /* non-JSON response (server crash page, proxy error, …) */
  }
  if (!res.ok) throw new Error(data.error ?? `Could not save reservation (HTTP ${res.status})`);
  return { wallet: data.wallet ?? input.wallet };
}

export interface MintRow {
  handle: string;
  handleLower: string;
  wallet: string;
  qty: number;
  handleVerified: boolean;
  status: ReservationStatus;
  createdAt: number;
}

const adminHeaders = (code: string): HeadersInit => ({
  "content-type": "application/json",
  "x-admin-code": code,
});

export async function listMintsAdmin(code: string): Promise<MintRow[]> {
  const res = await fetch("/api/mints", { cache: "no-store", headers: adminHeaders(code) });
  if (!res.ok) throw new Error("Unauthorized");
  return (await res.json()) as MintRow[];
}

export async function removeMintAdmin(wallet: string, adminCode: string): Promise<void> {
  const res = await fetch(`/api/mints?wallet=${encodeURIComponent(wallet)}`, {
    method: "DELETE",
    headers: adminHeaders(adminCode),
  });
  if (!res.ok) throw new Error("Could not delete reservation");
}

export async function setMintStatusAdmin(
  wallet: string,
  status: ReservationStatus,
  adminCode: string
): Promise<MintRow> {
  const res = await fetch("/api/mints", {
    method: "PATCH",
    headers: adminHeaders(adminCode),
    body: JSON.stringify({ wallet, status }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<MintRow>;
  if (!res.ok) throw new Error(data.error ?? "Could not update status");
  return data as MintRow;
}

export async function getMintByWallet(wallet: string): Promise<Reservation | null> {
  const res = await fetch(`/api/mints?wallet=${encodeURIComponent(wallet.trim())}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Lookup unavailable");
  const list = (await res.json()) as Array<{
    handle: string;
    wallet: string;
    qty: number;
    status?: ReservationStatus;
  }>;
  const f = list[0];
  if (!f) return null;
  return {
    handle: f.handle.replace(/^@/, "").toLowerCase(),
    wallet: f.wallet,
    qty: f.qty,
    at: Date.now(),
    handleVerified: false,
    status: f.status ?? "pending",
  };
}
