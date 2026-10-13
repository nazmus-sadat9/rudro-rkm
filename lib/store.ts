import type { Reservation } from "./config";
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
  all.push(r);
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

export function makeCode(): string {
  return "XC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
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
  code: string;
  handle: string;
  wallet: string;
  qty: number;
  tasks: { follow: boolean; like: boolean; rt: boolean; cmt: boolean };
  handleVerified: boolean;
  createdAt: number;
}): Promise<{ code: string }> {
  const res = await fetch("/api/mints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save reservation");
  return { code: data.code ?? input.code };
}

export interface MintRow {
  code: string;
  handle: string;
  handleLower: string;
  wallet: string;
  qty: number;
  handleVerified: boolean;
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

export async function removeMintAdmin(code: string, adminCode: string): Promise<void> {
  const res = await fetch(`/api/mints?code=${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers: adminHeaders(adminCode),
  });
  if (!res.ok) throw new Error("Could not delete reservation");
}

export async function getMintByCode(code: string): Promise<Reservation | null> {
  const res = await fetch(`/api/mints?code=${encodeURIComponent(code.trim().toUpperCase())}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Lookup unavailable");
  const list = (await res.json()) as Array<{
    handle: string;
    wallet: string;
    qty: number;
    code: string;
  }>;
  const f = list[0];
  if (!f) return null;
  return {
    handle: f.handle.replace(/^@/, "").toLowerCase(),
    wallet: f.wallet,
    qty: f.qty,
    code: f.code,
    at: Date.now(),
    handleVerified: false,
  };
}
