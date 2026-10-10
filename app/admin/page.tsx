"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  clearOrdersAdmin,
  listOrdersAdmin,
  removeOrderAdmin,
  saveOrderAdmin,
  type MintOrder,
} from "@/lib/orders";
import { Shell, SiteHeader, TextInput, Toast, cn } from "@/components/ui";

/** Session key for the admin code (sent as x-admin-code, checked against server ADMIN_CODE). */
const ADMIN_SESSION_KEY = "qm-admin-code";

interface DashboardStats {
  orders: number;
  pieces: number;
  verified: number;
  pending: number;
}

function short(v: string, head = 10, tail = 8): string {
  if (v.length <= head + tail + 3) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

function age(ts: number): string {
  const s: number = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminPage(): React.JSX.Element {
  const [adminCode, setAdminCode] = useState<string | null>(null);
  const [code, setCode] = useState<string>("");
  const [gateError, setGateError] = useState<string>("");
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [orders, setOrders] = useState<MintOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<MintOrder | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved: string | null = sessionStorage.getItem(ADMIN_SESSION_KEY);
      if (saved !== null && saved !== "") setAdminCode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const showToast = useCallback((msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const refresh = useCallback(
    async (codeOverride?: string): Promise<void> => {
      const key: string | null = codeOverride ?? adminCode;
      if (key === null) return;
      setLoading(true);
      setLoadError("");
      try {
        setOrders(await listOrdersAdmin(key));
      } catch {
        setLoadError("Could not load orders — wrong code or database unavailable.");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    [adminCode]
  );

  useEffect(() => {
    if (adminCode !== null) void refresh();
  }, [adminCode, refresh]);

  const copy = useCallback(
    async (value: string, label: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(value);
        showToast(`${label} copied`);
      } catch {
        showToast("Copy failed — select and copy manually");
      }
    },
    [showToast]
  );

  const toggleRow = (e: React.MouseEvent<HTMLElement>, token: string): void => {
    if ((e.target as HTMLElement).closest("button") !== null) return;
    setExpanded((cur: string | null) => (cur === token ? null : token));
  };

  const stats: DashboardStats = useMemo(() => {
    const verified: MintOrder[] = orders.filter((o: MintOrder) => o.status === "verified");
    return {
      orders: orders.length,
      pieces: orders.reduce((n: number, o: MintOrder) => n + o.quantity, 0),
      verified: verified.length,
      pending: orders.length - verified.length,
    };
  }, [orders]);

  const unlock = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const v: string = code.trim();
    if (v === "") {
      setGateError("Enter the admin code.");
      return;
    }
    setUnlocking(true);
    setGateError("");
    listOrdersAdmin(v)
      .then((list: MintOrder[]) => {
        setAdminCode(v);
        setOrders(list);
        try {
          sessionStorage.setItem(ADMIN_SESSION_KEY, v);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        setGateError("Wrong code, or the database is unavailable.");
      })
      .finally(() => {
        setUnlocking(false);
      });
  };

  const toggleStatus = (o: MintOrder): void => {
    if (adminCode === null) return;
    const next: MintOrder = {
      ...o,
      status: o.status === "verified" ? "awaiting_payment" : "verified",
    };
    saveOrderAdmin(next, adminCode)
      .then(() => refresh())
      .catch(() => showToast("Could not update order"));
  };

  const confirmDelete = useCallback((): void => {
    if (deleteTarget === null || adminCode === null) return;
    removeOrderAdmin(deleteTarget.token, adminCode)
      .then(() => {
        setDeleteTarget(null);
        showToast("Order removed");
        return refresh();
      })
      .catch(() => showToast("Could not delete order"));
  }, [deleteTarget, adminCode, refresh, showToast]);

  const cancelDelete = useCallback((): void => {
    setDeleteTarget(null);
  }, []);

  // Close the warning popup with Escape + lock background scroll while open.
  useEffect(() => {
    if (deleteTarget === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setDeleteTarget(null);
    };
    document.addEventListener("keydown", onKey);
    const prev: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [deleteTarget]);

  const exportCsv = (): void => {
    const rows: string[] = [
      ["token", "address", "quantity", "amountSats", "recipient", "status", "txid", "createdAt"].join(","),
      ...orders.map((o: MintOrder) =>
        [o.token, o.address, o.quantity, o.amountSats, o.recipient, o.status, o.txid, o.createdAt].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url: string = URL.createObjectURL(blob);
    const a: HTMLAnchorElement = document.createElement("a");
    a.href = url;
    a.download = "claims.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (adminCode === null) {
    return (
      <Shell>
        <SiteHeader
          tag="ADMIN"
          badge="LOCKED"
          badgeTone="warn"
          links={[{ href: "/claim", label: "← Claim page" }]}
        />
        <main className="w-full max-w-[460px] min-w-0">
          <section className="mt-3.5 min-w-0 overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_18px_44px_rgba(0,0,0,0.35)]">
            <div className="flex min-w-0 items-center gap-3 border-b border-line bg-card2 p-4 sm:px-[22px]">
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-brand-deep font-mono text-[13px] font-bold text-white">
                ✦
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold break-words">Admin access</h2>
                <p className="mt-[3px] text-xs break-words text-mut">
                  Enter the server admin code to view orders.
                </p>
              </div>
            </div>
            <form onSubmit={unlock} className="grid min-w-0 gap-2 p-4 sm:px-[22px] sm:pt-5 sm:pb-2">
              <span className="mt-2 font-mono text-[10px] tracking-[1.4px] text-faint">
                ACCESS CODE
              </span>
              <TextInput
                id="qm-admin-code"
                value={code}
                placeholder="Enter admin code"
                onChange={(v: string) => {
                  setCode(v);
                  setGateError("");
                }}
              />
              <button
                type="submit"
                disabled={unlocking}
                className="mt-3 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-deep px-[22px] text-sm font-bold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-45"
              >
                {unlocking ? "Checking…" : "Unlock dashboard →"}
              </button>
            </form>
            <p
              className={cn(
                "min-h-[22px] px-4 pb-4 text-[12.5px] leading-relaxed break-words sm:px-[22px]",
                gateError !== "" ? "text-bad" : "text-mut"
              )}
            >
              {gateError !== ""
                ? gateError
                : "The code is checked against the server (ADMIN_CODE)."}
            </p>
          </section>
        </main>
        <Toast message={toast} />
      </Shell>
    );
  }

  return (
    <Shell>
      <SiteHeader
        tag="ADMIN"
        badge="DB CONNECTED"
        badgeTone="ok"
        links={[{ href: "/claim", label: "← Claim page" }]}
      />

      <main className="min-w-0">
        <section className="max-w-[720px] min-w-0 pt-7 text-left sm:pt-[30px]">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[2px] text-brand">
            <span aria-hidden="true" className="h-[2px] w-[22px] flex-none rounded-sm bg-brand" />
            DASHBOARD
          </span>
          <h1 className="mt-4 mb-3.5 font-display text-[34px] leading-[1.05] font-semibold tracking-tight break-words sm:text-5xl lg:text-[60px]">
            Every claim, <em className="text-brand not-italic">one table.</em>
          </h1>
          <p className="max-w-[600px] text-sm leading-[1.75] text-mut sm:text-[15px]">
            Review incoming claims, flip their status, and export for reconciliation.
          </p>
        </section>

        <section className="mt-6 min-w-0 rounded-[18px] border border-line bg-card p-4 shadow-[0_18px_44px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <h2 className="font-display text-[15px] font-semibold tracking-tight">
              Overview · out of 1,000
            </h2>
            <span className="font-mono text-xs break-words text-mut">
              <b className="font-display text-2xl font-semibold tracking-tight text-ink">
                {stats.pieces.toLocaleString("en-US")}
              </b>{" "}
              / 1,000 pieces requested
            </span>
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-2 gap-2.5 lg:grid-cols-3">
            {[
              { k: "ORDERS", v: String(stats.orders) },
              { k: "VERIFIED", v: String(stats.verified) },
              { k: "PENDING", v: String(stats.pending) },
            ].map((s, i) => (
              <div
                key={s.k}
                className={cn(
                  "min-w-0 rounded-xl border border-line bg-deep/60 px-3.5 py-3",
                  i === 2 && "col-span-2 lg:col-span-1"
                )}
              >
                <small className="block font-mono text-[9px] tracking-[1.4px] text-faint">
                  {s.k}
                </small>
                <strong className="mt-[7px] block font-display text-base font-semibold tracking-tight break-words text-white sm:text-[19px]">
                  {s.v}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          {[
            { label: loading ? "↻ Loading…" : "↻ Refresh", action: () => void refresh(), disabled: loading },
            { label: "↓ Export CSV", action: exportCsv, disabled: orders.length === 0 },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.action}
              disabled={b.disabled}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] border border-line bg-transparent px-[22px] py-2.5 text-[13px] font-semibold text-brand-ink transition hover:border-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              {b.label}
            </button>
          ))}
          <button
            type="button"
            disabled={orders.length === 0 || adminCode === null}
            onClick={() => {
              if (adminCode === null) return;
              clearOrdersAdmin(adminCode)
                .then(() => {
                  showToast("All orders cleared");
                  return refresh();
                })
                .catch(() => showToast("Could not clear orders"));
            }}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] border border-line bg-transparent px-[22px] py-2.5 text-[13px] font-semibold text-brand-ink transition hover:border-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            Clear all
          </button>
        </div>

        {loadError !== "" && (
          <p className="mt-3 rounded-[10px] border border-bad/30 bg-bad/10 px-3.5 py-3 text-[12px] leading-relaxed break-words text-bad">
            {loadError}
          </p>
        )}

        {orders.length === 0 ? (
          <div className="mt-3.5 rounded-[14px] border border-line bg-card px-5 py-10 text-center text-[13px] break-words text-faint">
            No claims yet. Submit one on the claim page and it will show up here.
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards — no horizontal scroll, no clipped columns */}
            <div className="mt-3.5 grid min-w-0 gap-2.5 md:hidden">
              {orders.map((o: MintOrder) => (
                <article
                  key={o.token}
                  onClick={(e: React.MouseEvent<HTMLElement>) => toggleRow(e, o.token)}
                  className="min-w-0 rounded-[14px] border border-line bg-card p-4"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 font-mono text-[11px] break-all text-mut">
                      {expanded === o.token ? "▾ " : "▸ "}
                      {short(o.address)}
                    </p>
                    <span
                      className={cn(
                        "flex-none rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold whitespace-nowrap",
                        o.status === "verified"
                          ? "border-ok/40 bg-ok/10 text-ok"
                          : "border-warn/40 bg-warn/10 text-warn"
                      )}
                    >
                      {o.status === "verified" ? "VERIFIED" : "AWAITING"}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] break-words text-faint">
                    QTY {o.quantity} · {age(o.createdAt)} · {o.amountSats.toLocaleString("en-US")} sats
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => toggleStatus(o)}
                      className="min-h-10 rounded-lg border border-ok/50 bg-ok/10 px-2 py-2 font-mono text-[11px] whitespace-nowrap text-ok transition hover:bg-ok/20"
                    >
                      {o.status === "verified" ? "Reopen" : "Verify"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(o)}
                      className="min-h-10 rounded-lg border border-bad/50 bg-bad/10 px-2 py-2 font-mono text-[11px] whitespace-nowrap text-bad transition hover:border-bad"
                    >
                      Delete
                    </button>
                  </div>
                  {expanded === o.token && (
                    <div className="mt-3 grid min-w-0 gap-2.5 border-t border-line pt-3">
                      <DetailRow
                        label="FULL ADDRESS"
                        value={o.address}
                        onCopy={() => void copy(o.address, "Address")}
                      />
                      <DetailRow
                        label="FEE"
                        value={`${o.amountSats.toLocaleString("en-US")} sats`}
                      />
                      <DetailRow
                        label="TX HASH"
                        value={o.txid !== "" ? o.txid : "—"}
                        onCopy={o.txid !== "" ? () => void copy(o.txid, "Tx hash") : undefined}
                      />
                      <DetailRow label="AGE" value={age(o.createdAt)} />
                      <DetailRow
                        label="RECOVERY CODE"
                        value={o.token}
                        onCopy={() => void copy(o.token, "Recovery code")}
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>

            {/* Desktop: full table */}
            <div className="mt-3.5 hidden min-w-0 overflow-x-auto rounded-[14px] border border-line bg-card md:block">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead>
                  <tr className="bg-card2">
                    {["DELIVERY ADDRESS", "QTY", "FEE (SATS)", "STATUS", "TX HASH", "AGE", ""].map(
                      (h: string) => (
                        <th
                          key={h}
                          className="border-b border-line px-3.5 py-3 text-left font-mono text-[9px] font-semibold tracking-[1.4px] whitespace-nowrap text-faint"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: MintOrder) => (
                    <Fragment key={o.token}>
                      <tr
                        onClick={(e: React.MouseEvent<HTMLTableRowElement>) => toggleRow(e, o.token)}
                        title="Click to expand details"
                        className="cursor-pointer transition hover:bg-brand/5"
                      >
                        <td className="border-b border-line px-3.5 py-3 font-mono text-[11px] break-all text-mut" title={o.address}>
                          {expanded === o.token ? "▾ " : "▸ "}
                          {short(o.address)}
                        </td>
                        <td className="border-b border-line px-3.5 py-3 whitespace-nowrap">{o.quantity}</td>
                        <td className="border-b border-line px-3.5 py-3 font-mono text-[11px] whitespace-nowrap text-mut">
                          {o.amountSats.toLocaleString("en-US")}
                        </td>
                        <td className="border-b border-line px-3.5 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-block rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold whitespace-nowrap",
                              o.status === "verified"
                                ? "border-ok/40 bg-ok/10 text-ok"
                                : "border-warn/40 bg-warn/10 text-warn"
                            )}
                          >
                            {o.status === "verified" ? "VERIFIED" : "AWAITING"}
                          </span>
                        </td>
                        <td className="border-b border-line px-3.5 py-3 font-mono text-[11px] whitespace-nowrap text-mut" title={o.txid}>
                          {o.txid !== "" ? short(o.txid, 8, 6) : "—"}
                        </td>
                        <td className="border-b border-line px-3.5 py-3 font-mono text-[11px] whitespace-nowrap text-mut">
                          {age(o.createdAt)}
                        </td>
                        <td className="border-b border-line px-3.5 py-3 whitespace-nowrap">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleStatus(o)}
                              className="rounded-lg border border-ok/50 bg-ok/10 px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap text-ok transition hover:bg-ok/20"
                            >
                              {o.status === "verified" ? "Reopen" : "Verify"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(o)}
                              className="rounded-lg border border-bad/50 bg-bad/10 px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap text-bad transition hover:border-bad"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === o.token && (
                        <tr key={`${o.token}-detail`} className="bg-card2">
                          <td colSpan={7} className="border-b border-line px-3.5 py-3">
                            <div className="grid min-w-0 gap-2">
                              <DetailRow
                                label="FULL ADDRESS"
                                value={o.address}
                                onCopy={() => void copy(o.address, "Address")}
                              />
                              <DetailRow
                                label="FEE"
                                value={`${o.amountSats.toLocaleString("en-US")} sats`}
                              />
                              <DetailRow
                                label="TX HASH"
                                value={o.txid !== "" ? o.txid : "—"}
                                onCopy={o.txid !== "" ? () => void copy(o.txid, "Tx hash") : undefined}
                              />
                              <DetailRow label="AGE" value={age(o.createdAt)} />
                              <DetailRow
                                label="RECOVERY CODE"
                                value={o.token}
                                onCopy={() => void copy(o.token, "Recovery code")}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-3.5 flex min-w-0 items-start gap-2.5 rounded-xl border border-line bg-card px-4 py-3.5 text-xs leading-[1.65] break-words text-mut">
          <span aria-hidden="true" className="flex-none">◈</span>
          <div className="min-w-0">
            <b className="text-ink">
              Database status: connected (MongoDB via /api/orders).
            </b>
            <br />
            Orders are stored in the shared database. Make sure{" "}
            <code className="rounded-[5px] bg-brand/10 px-1.5 py-px font-mono text-[11px] break-all text-brand-ink">
              MONGODB_URI
            </code>{" "}
            and{" "}
            <code className="rounded-[5px] bg-brand/10 px-1.5 py-px font-mono text-[11px] break-all text-brand-ink">
              ADMIN_CODE
            </code>{" "}
            are set in the hosting environment.
          </div>
        </div>
      </main>

      <Toast message={toast} />

      {deleteTarget !== null && (
        <DeleteConfirmDialog
          order={deleteTarget}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </Shell>
  );
}

type DeleteConfirmDialogProps = Readonly<{
  order: MintOrder;
  onCancel: () => void;
  onConfirm: () => void;
}>;

function DeleteConfirmDialog({ order, onCancel, onConfirm }: DeleteConfirmDialogProps): React.JSX.Element {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="qm-delete-title"
      aria-describedby="qm-delete-desc"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Close delete warning"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
      />
      <div className="relative w-full min-w-0 max-w-sm rounded-2xl border border-line bg-card p-5 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-bad/40 bg-bad/10 text-lg text-bad"
          >
            ⚠
          </span>
          <div className="min-w-0">
            <h2 id="qm-delete-title" className="font-display text-base font-semibold break-words text-[#ff6b6b]" style={{ color: "#ff6b6b" }}>
              Delete this claim?
            </h2>
            <p id="qm-delete-desc" className="mt-1 text-xs leading-relaxed break-words text-mut">
              This permanently removes the order for{" "}
              <span className="font-mono break-all text-ink">{short(order.address)}</span>{" "}
              (qty {order.quantity}). This can&apos;t be undone.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-line bg-transparent px-4 text-[13px] font-semibold text-ink transition hover:border-brand hover:text-brand-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-bad px-4 text-[13px] font-bold text-card2 transition hover:brightness-110"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

type DetailRowProps = Readonly<{
  label: string;
  value: string;
  onCopy?: () => void;
}>;

function DetailRow({ label, value, onCopy }: DetailRowProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="flex-none font-mono text-[9px] font-semibold tracking-[1.2px] text-faint">
        {label}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-1 sm:flex-row sm:items-center sm:justify-end">
        <code className="min-w-0 font-mono text-[11px] break-all text-mut sm:text-right">
          {value}
        </code>
        {onCopy !== undefined && (
          <button
            type="button"
            onClick={onCopy}
            className="h-9 flex-none rounded-lg border border-line bg-transparent px-3 font-mono text-[11px] whitespace-nowrap text-mut transition hover:border-brand hover:text-brand-ink"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
