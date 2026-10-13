export interface QuestTasks {
  follow: boolean;
  likeRepost: boolean;
  comment: boolean;
}

/** Epoch-ms stamps of when each task was guided-verified (0 = not verified). */
export interface QuestTaskStamps {
  follow: number;
  likeRepost: number;
  comment: number;
}

export interface Reservation {
  /** Private recovery code (also the record id). */
  token: string;
  /** X handle as entered (with or without @). */
  xHandle: string;
  /** Lowercased handle without @, for uniqueness. */
  xHandleLower: string;
  /** bc1p Taproot wallet. One wallet = one reservation max. */
  wallet: string;
  quantity: number;
  tasks: QuestTasks;
  /** Guided-verify timestamps (lite verification, not API-checked). */
  taskAt: QuestTaskStamps;
  createdAt: number;
}

export interface ReservationStats {
  count: number;
  pieces: number;
  remaining: number;
  soldOut: boolean;
}

export async function saveReservationAsync(r: Reservation): Promise<{ token: string }> {
  const res = await fetch("/api/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(r),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save reservation");
  return { token: data.token ?? r.token };
}

export async function getReservation(token: string): Promise<Reservation | null> {
  const res = await fetch(`/api/reservations?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Reservation API unavailable");
  const list = (await res.json()) as Reservation[];
  return list[0] ?? null;
}

export async function getReservationStats(): Promise<ReservationStats> {
  const res = await fetch("/api/reservations?stats=1", { cache: "no-store" });
  if (!res.ok) throw new Error("Stats unavailable");
  return (await res.json()) as ReservationStats;
}

/* Admin */

const adminHeaders = (code: string): HeadersInit => ({
  "content-type": "application/json",
  "x-admin-code": code,
});

export async function listReservationsAdmin(code: string): Promise<Reservation[]> {
  const res = await fetch("/api/reservations", {
    cache: "no-store",
    headers: adminHeaders(code),
  });
  if (!res.ok) throw new Error("Unauthorized");
  return (await res.json()) as Reservation[];
}

export async function removeReservationAdmin(token: string, code: string): Promise<void> {
  const res = await fetch(`/api/reservations?token=${encodeURIComponent(token)}`, {
    method: "DELETE",
    headers: adminHeaders(code),
  });
  if (!res.ok) throw new Error("Could not delete reservation");
}

export async function clearReservationsAdmin(code: string): Promise<void> {
  const res = await fetch("/api/reservations", {
    method: "DELETE",
    headers: adminHeaders(code),
  });
  if (!res.ok) throw new Error("Could not clear reservations");
}
