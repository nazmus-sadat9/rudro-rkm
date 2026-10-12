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
        <main className="ob-narrow">
          <section className="ob-card ob-card--flat">
            <div className="ob-card-head">
              <span className="ob-card-num">✦</span>
              <div>
                <h2>Admin access</h2>
                <p>Enter the server admin code to view orders.</p>
              </div>
            </div>
            <form onSubmit={unlock} className="ob-form">
              <span className="ob-label">ACCESS CODE</span>
              <TextInput
                id="qm-admin-code"
                value={code}
                placeholder="Enter admin code"
                onChange={(v: string) => {
                  setCode(v);
                  setGateError("");
                }}
              />
              <button type="submit" disabled={unlocking} className="ob-btn">
                {unlocking ? "Checking…" : "Unlock dashboard →"}
              </button>
            </form>
            <p className={cn("ob-msg", gateError !== "" && "ob-msg--error")}>
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
        badge={loadError !== "" ? "DB UNREACHABLE" : "DB CONNECTED"}
        badgeTone={loadError !== "" ? "warn" : "ok"}
        links={[{ href: "/claim", label: "← Claim page" }]}
      />

      <main>
        <section className="ob-hero ob-hero--tight">
          <span className="ob-kicker">
            <span aria-hidden="true" className="ob-kicker-bar" />
            DASHBOARD
          </span>
          <h1 className="ob-title">
            Every claim, <em>one table.</em>
          </h1>
          <p className="ob-lead">
            Review incoming claims, flip their status, and export for reconciliation.
          </p>
        </section>

        <section className="ob-panel">
          <div className="ob-panel-head">
            <h2>Overview · out of 1,000</h2>
            <span className="ob-panel-count">
              <b>{stats.pieces.toLocaleString("en-US")}</b> / 1,000 pieces requested
            </span>
          </div>
          <div className="ob-stats">
            {[
              { k: "ORDERS", v: String(stats.orders) },
              { k: "VERIFIED", v: String(stats.verified) },
              { k: "PENDING", v: String(stats.pending) },
            ].map((s, i) => (
              <div key={s.k} className={cn("ob-stat", i === 2 && "ob-stat--wide")}>
                <small>{s.k}</small>
                <strong>{s.v}</strong>
              </div>
            ))}
          </div>
        </section>

        <div className="ob-toolbar">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="ob-tool-btn"
          >
            {loading ? "↻ Loading…" : "↻ Refresh"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={orders.length === 0}
            className="ob-tool-btn"
          >
            ↓ Export CSV
          </button>
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
            className="ob-tool-btn"
          >
            Clear all
          </button>
        </div>

        {loadError !== "" && <p className="ob-alert">{loadError}</p>}

        {orders.length === 0 ? (
          <div className="ob-empty">
            No claims yet. Submit one on the claim page and it will show up here.
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards — no horizontal scroll, no clipped columns */}
            <div className="ob-cards">
              {orders.map((o: MintOrder) => (
                <article
                  key={o.token}
                  onClick={(e: React.MouseEvent<HTMLElement>) => toggleRow(e, o.token)}
                  className="ob-order-card"
                >
                  <div className="ob-order-top">
                    <p className="ob-order-addr">
                      {expanded === o.token ? "▾ " : "▸ "}
                      {short(o.address)}
                    </p>
                    <span className={cn("ob-pill", o.status === "verified" ? "ob-pill--ok" : "ob-pill--await")}>
                      {o.status === "verified" ? "VERIFIED" : "AWAITING"}
                    </span>
                  </div>
                  <p className="ob-order-sub">
                    QTY {o.quantity} · {age(o.createdAt)} · {o.amountSats.toLocaleString("en-US")} sats
                  </p>
                  <div className="ob-order-actions">
                    <button
                      type="button"
                      onClick={() => toggleStatus(o)}
                      className="ob-mini ob-mini--verify"
                    >
                      {o.status === "verified" ? "Reopen" : "Verify"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(o)}
                      className="ob-mini ob-mini--danger"
                    >
                      Delete
                    </button>
                  </div>
                  {expanded === o.token && (
                    <div className="ob-detail">
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
            <div className="ob-dtable-wrap">
              <table className="ob-dtable">
                <thead>
                  <tr>
                    {["DELIVERY ADDRESS", "QTY", "FEE (SATS)", "STATUS", "TX HASH", "AGE", ""].map(
                      (h: string) => (
                        <th key={h}>{h}</th>
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
                        className="ob-row"
                      >
                        <td className="ob-mono" title={o.address}>
                          {expanded === o.token ? "▾ " : "▸ "}
                          {short(o.address)}
                        </td>
                        <td className="ob-nowrap">{o.quantity}</td>
                        <td className="ob-mono ob-nowrap">
                          {o.amountSats.toLocaleString("en-US")}
                        </td>
                        <td className="ob-nowrap">
                          <span className={cn("ob-pill", o.status === "verified" ? "ob-pill--ok" : "ob-pill--await")}>
                            {o.status === "verified" ? "VERIFIED" : "AWAITING"}
                          </span>
                        </td>
                        <td className="ob-mono ob-nowrap" title={o.txid}>
                          {o.txid !== "" ? short(o.txid, 8, 6) : "—"}
                        </td>
                        <td className="ob-mono ob-nowrap">{age(o.createdAt)}</td>
                        <td className="ob-nowrap">
                          <div className="ob-row-btns">
                            <button
                              type="button"
                              onClick={() => toggleStatus(o)}
                              className="ob-mini ob-mini--verify"
                            >
                              {o.status === "verified" ? "Reopen" : "Verify"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(o)}
                              className="ob-mini ob-mini--danger"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === o.token && (
                        <tr key={`${o.token}-detail`} className="ob-detail-row">
                          <td colSpan={7}>
                            <div className="ob-detail">
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

        <div className="ob-db">
          <span aria-hidden="true">◈</span>
          <div>
            <b>Database status: connected (MongoDB via /api/orders).</b>
            <br />
            Orders are stored in the shared database. Make sure{" "}
            <code>MONGODB_URI</code> and <code>ADMIN_CODE</code> are set in the
            hosting environment.
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
      className="ob-dialog"
    >
      <button
        type="button"
        aria-label="Close delete warning"
        onClick={onCancel}
        className="ob-dialog-veil"
      />
      <div className="ob-dialog-box">
        <div className="ob-dialog-top">
          <span aria-hidden="true" className="ob-dialog-icon">
            ⚠
          </span>
          <div>
            <h2 id="qm-delete-title">Delete this claim?</h2>
            <p id="qm-delete-desc">
              This permanently removes the order for <span>{short(order.address)}</span>{" "}
              (qty {order.quantity}). This can&apos;t be undone.
            </p>
          </div>
        </div>
        <div className="ob-dialog-actions">
          <button type="button" autoFocus onClick={onCancel} className="ob-dialog-cancel">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="ob-dialog-confirm">
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
    <div className="ob-drow">
      <span>{label}</span>
      <div className="ob-drow-body">
        <code>{value}</code>
        {onCopy !== undefined && (
          <button type="button" onClick={onCopy}>
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
