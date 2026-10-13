"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { SITE } from "@/lib/config";
import { listMintsAdmin, removeMintAdmin, type MintRow } from "@/lib/store";
import { FieldLabel, Shell, SiteHeader, TextInput, Toast, cn } from "@/components/ui";

/** Session key for the admin code (sent as x-admin-code, checked against server ADMIN_CODE). */
const ADMIN_SESSION_KEY = "oblyx-admin-code";

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
  const [orders, setOrders] = useState<MintRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<MintRow | null>(null);
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
        setOrders(await listMintsAdmin(key));
      } catch {
        setLoadError("Could not load reservations — wrong code or database unavailable.");
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

  const toggleRow = (e: React.MouseEvent<HTMLElement>, key: string): void => {
    if ((e.target as HTMLElement).closest("button") !== null) return;
    setExpanded((cur: string | null) => (cur === key ? null : key));
  };

  const pieces: number = useMemo(
    () => orders.reduce((n: number, o: MintRow) => n + o.qty, 0),
    [orders]
  );
  const remaining: number = Math.max(0, SITE.totalSlots - SITE.alreadyReserved - pieces);

  const unlock = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const v: string = code.trim();
    if (v === "") {
      setGateError("Enter the admin code.");
      return;
    }
    setUnlocking(true);
    setGateError("");
    listMintsAdmin(v)
      .then((list: MintRow[]) => {
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

  const confirmDelete = useCallback((): void => {
    if (deleteTarget === null || adminCode === null) return;
    removeMintAdmin(deleteTarget.code, adminCode)
      .then(() => {
        setDeleteTarget(null);
        showToast("Reservation removed");
        return refresh();
      })
      .catch(() => showToast("Could not delete reservation"));
  }, [deleteTarget, adminCode, refresh, showToast]);

  const cancelDelete = useCallback((): void => {
    setDeleteTarget(null);
  }, []);

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
      ["code", "handle", "wallet", "qty", "handleVerified", "createdAt"].join(","),
      ...orders.map((o: MintRow) =>
        [o.code, o.handle, o.wallet, o.qty, o.handleVerified, o.createdAt].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url: string = URL.createObjectURL(blob);
    const a: HTMLAnchorElement = document.createElement("a");
    a.href = url;
    a.download = "oblyx-mints.csv";
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
          links={[{ href: "/", label: "← Home" }]}
        />
        <main className="ob-narrow">
          <section className="ob-card ob-card--flat">
            <div className="ob-card-head">
              <span className="ob-card-num">O</span>
              <div>
                <h2>Admin access</h2>
                <p>Enter the server admin code to view reservations.</p>
              </div>
            </div>
            <form onSubmit={unlock} className="ob-form">
              <FieldLabel htmlFor="ob-admin-code">ACCESS CODE</FieldLabel>
              <TextInput
                id="ob-admin-code"
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
              {gateError !== "" ? gateError : "The code is checked against the server (ADMIN_CODE)."}
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
        links={[{ href: "/", label: "← Home" }]}
      />

      <main>
        <section className="ob-hero ob-hero--tight">
          <span className="ob-kicker">
            <span aria-hidden="true" className="ob-kicker-bar" />
            DASHBOARD
          </span>
          <h1 className="ob-title">
            Every reservation, <em>one table.</em>
          </h1>
          <p className="ob-lead">
            Review X handles and wallets. One wallet = one reservation, max {SITE.maxPerWallet}{" "}
            NFTs, {SITE.totalSlots.toLocaleString("en-US")} total.
          </p>
        </section>

        <section className="ob-panel">
          <div className="ob-panel-head">
            <h2>Overview · out of {SITE.totalSlots.toLocaleString("en-US")}</h2>
            <span className="ob-panel-count">
              <b>{pieces.toLocaleString("en-US")}</b> / {SITE.totalSlots.toLocaleString("en-US")}{" "}
              taken
            </span>
          </div>
          <div className="ob-stats">
            {[
              { k: "RESERVATIONS", v: String(orders.length) },
              { k: "NFTS TAKEN", v: String(pieces) },
              { k: "REMAINING", v: String(remaining) },
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
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={orders.length === 0}
            className="ob-tool-btn"
          >
            Export CSV
          </button>
        </div>

        {loadError !== "" && <p className="ob-alert">{loadError}</p>}

        {orders.length === 0 ? (
          <div className="ob-empty">
            No reservations yet. Submit one on the home page and it will show up here.
          </div>
        ) : (
          <>
            <div className="ob-cards">
              {orders.map((o: MintRow) => (
                <article key={o.code} className="ob-order-card">
                  <div
                    className="ob-order-top"
                    onClick={(e: React.MouseEvent<HTMLElement>) => toggleRow(e, o.code)}
                  >
                    <p className="ob-order-addr">
                      {expanded === o.code ? "▾ " : "▸ "}
                      {o.handle} · {short(o.wallet)}
                    </p>
                    <span className="ob-pill ob-pill--ok">×{o.qty}</span>
                  </div>
                  <p className="ob-order-sub">
                    {age(o.createdAt)} · {o.handleVerified ? "handle API-checked" : "handle format-only"}
                  </p>
                  <div className="ob-order-actions">
                    <button
                      type="button"
                      onClick={() => void copy(o.wallet, "Wallet")}
                      className="ob-mini"
                    >
                      Copy wallet
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(o)}
                      className="ob-mini ob-mini--danger"
                    >
                      Delete
                    </button>
                  </div>
                  {expanded === o.code && (
                    <div className="ob-detail">
                      <DetailRow label="X HANDLE" value={o.handle} />
                      <DetailRow
                        label="WALLET"
                        value={o.wallet}
                        onCopy={() => void copy(o.wallet, "Wallet")}
                      />
                      <DetailRow label="NFTS" value={String(o.qty)} />
                      <DetailRow label="AGE" value={age(o.createdAt)} />
                      <DetailRow
                        label="RESERVATION CODE"
                        value={o.code}
                        onCopy={() => void copy(o.code, "Reservation code")}
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="ob-dtable-wrap">
              <table className="ob-dtable">
                <thead>
                  <tr>
                    {["X HANDLE", "WALLET", "QTY", "CHECK", "AGE", ""].map((h: string) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: MintRow) => (
                    <Fragment key={o.code}>
                      <tr
                        onClick={(e: React.MouseEvent<HTMLTableRowElement>) => toggleRow(e, o.code)}
                        title="Click to expand details"
                        className="ob-row"
                      >
                        <td className="ob-mono">{o.handle}</td>
                        <td className="ob-mono" title={o.wallet}>
                          {short(o.wallet)}
                        </td>
                        <td className="ob-nowrap">{o.qty}</td>
                        <td className="ob-mono ob-nowrap">{o.handleVerified ? "✓ api" : "· fmt"}</td>
                        <td className="ob-mono ob-nowrap">{age(o.createdAt)}</td>
                        <td className="ob-nowrap">
                          <div className="ob-row-btns">
                            <button
                              type="button"
                              onClick={() => void copy(o.wallet, "Wallet")}
                              className="ob-mini"
                            >
                              Copy
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
                      {expanded === o.code && (
                        <tr key={`${o.code}-detail`} className="ob-detail-row">
                          <td colSpan={6}>
                            <div className="ob-detail">
                              <DetailRow
                                label="FULL WALLET"
                                value={o.wallet}
                                onCopy={() => void copy(o.wallet, "Wallet")}
                              />
                              <DetailRow label="AGE" value={age(o.createdAt)} />
                              <DetailRow
                                label="RESERVATION CODE"
                                value={o.code}
                                onCopy={() => void copy(o.code, "Reservation code")}
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
            <b>Database status: connected (MongoDB via /api/mints, mint_reservations).</b>
            <br />
            The old bc1p allowlist flow is retired. Make sure <code>MONGODB_URI</code> and{" "}
            <code>ADMIN_CODE</code> are set in the hosting environment.
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
  order: MintRow;
  onCancel: () => void;
  onConfirm: () => void;
}>;

function DeleteConfirmDialog({ order, onCancel, onConfirm }: DeleteConfirmDialogProps): React.JSX.Element {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ob-delete-title"
      aria-describedby="ob-delete-desc"
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
            !
          </span>
          <div>
            <h2 id="ob-delete-title">Delete this reservation?</h2>
            <p id="ob-delete-desc">
              This permanently removes the reservation for <span>{order.handle}</span> (×
              {order.qty}). This can&apos;t be undone.
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
