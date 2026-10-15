"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SITE, type ReservationStatus } from "../../lib/config";
import { listMintsAdmin, removeMintAdmin, setMintStatusAdmin, type MintRow } from "../../lib/store";

const ADMIN_SESSION_KEY = "oblyx-admin-code";

const STATUS_COLOR: Record<ReservationStatus, string> = {
  pending: "#f2b84e",
  accepted: "#4ad69b",
  rejected: "#f08a80",
};

function age(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminPage() {
  const [adminCode, setAdminCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [gateError, setGateError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [rows, setRows] = useState<MintRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MintRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState("");
  const [busyWallet, setBusyWallet] = useState("");
  const [tab, setTab] = useState<"pending" | "approved">("pending");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(ADMIN_SESSION_KEY);
      if (saved) setAdminCode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(
    async (keyOverride?: string) => {
      const key = keyOverride ?? adminCode;
      if (!key) return;
      setLoading(true);
      setLoadError("");
      try {
        setRows(await listMintsAdmin(key));
      } catch {
        setLoadError("Could not load — wrong code or database unavailable.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [adminCode]
  );

  useEffect(() => {
    if (adminCode) void refresh();
  }, [adminCode, refresh]);

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    const v = code.trim();
    if (!v) {
      setGateError("Enter the admin code.");
      return;
    }
    setUnlocking(true);
    setGateError("");
    listMintsAdmin(v)
      .then((list) => {
        setAdminCode(v);
        setRows(list);
        try {
          sessionStorage.setItem(ADMIN_SESSION_KEY, v);
        } catch {
          /* ignore */
        }
      })
      .catch(() => setGateError("Wrong code, or the database is unavailable."))
      .finally(() => setUnlocking(false));
  }

  function lock() {
    setAdminCode(null);
    setRows([]);
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied`);
    } catch {
      setCopied("Copy failed — select manually");
    }
    window.setTimeout(() => setCopied(""), 2000);
  }

  function exportCsv() {
    const head = ["handle", "wallet", "qty", "status", "handleVerified", "createdAt"].join(",");
    const body = visible.map((r) =>
      [r.handle, r.wallet, r.qty, r.status ?? "pending", r.handleVerified, r.createdAt].join(",")
    );
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oblyx-reservations-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pieces = useMemo(
    () => rows.filter((r) => (r.status ?? "pending") !== "rejected").reduce((n, r) => n + r.qty, 0),
    [rows]
  );
  const remaining = Math.max(0, SITE.totalSlots - SITE.alreadyReserved - pieces);
  const pendingCount = useMemo(
    () => rows.filter((r) => (r.status ?? "pending") === "pending").length,
    [rows]
  );
  const approvedCount = useMemo(
    () => rows.filter((r) => (r.status ?? "pending") === "accepted").length,
    [rows]
  );
  // Visible rows for the active tab, newest first. Rejected never shown.
  const visible = useMemo(
    () =>
      rows
        .filter((r) => (tab === "pending" ? (r.status ?? "pending") === "pending" : r.status === "accepted"))
        .sort((a, b) => b.createdAt - a.createdAt),
    [rows, tab]
  );

  async function confirmDelete() {
    if (!adminCode || !deleteTarget || deleting) return;
    setDeleting(true);
    setLoadError("");
    try {
      await removeMintAdmin(deleteTarget.wallet, adminCode);
      setDeleteTarget(null);
      setCopied("Reservation deleted");
      window.setTimeout(() => setCopied(""), 2000);
      await refresh();
    } catch {
      setLoadError("Could not delete reservation.");
    } finally {
      setDeleting(false);
    }
  }

  // Close the popup with Escape.
  useEffect(() => {
    if (!deleteTarget) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDeleteTarget(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget]);

  async function setStatus(wallet: string, status: ReservationStatus) {
    if (!adminCode || busyWallet) return;
    setBusyWallet(wallet);
    setLoadError("");
    try {
      const updated = await setMintStatusAdmin(wallet, status, adminCode);
      setRows((prev) => prev.map((r) => (r.wallet === wallet ? updated : r)));
      setCopied(status === "accepted" ? "Reservation accepted" : "Reservation rejected");
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setLoadError("Could not update status.");
    } finally {
      setBusyWallet("");
    }
  }

  if (!adminCode) {
    return (
      <>
        <header className="nav">
          <div className="nav-in">
            <div className="badge-x">O</div>
            <div className="brand"><b>Oblyx Admin</b><span>Restricted area</span></div>
            <div className="left-pill">Locked</div>
          </div>
        </header>
        <div className="shell">
          <section className="card tint-iris">
            <div className="sec-label mono">ADMIN ACCESS</div>
            <h2>Enter admin code</h2>
            <p className="sub">Checked against the server. Never shared, never stored except this tab.</p>
            <form onSubmit={unlock}>
              <label className="lbl" htmlFor="adm">Access code</label>
              <input
                id="adm"
                type="password"
                autoComplete="off"
                value={code}
                placeholder="••••••••"
                onChange={(e) => {
                  setCode(e.target.value);
                  setGateError("");
                }}
              />
              {gateError && <p className="err">{gateError}</p>}
              <div className="btnrow">
                <button type="submit" disabled={unlocking} className="btn btn-p">
                  {unlocking ? "Checking…" : "Unlock →"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="nav">
        <div className="nav-in">
          <div className="badge-x">O</div>
          <div className="brand"><b>Oblyx Admin</b><span>{pendingCount} pending • {approvedCount} approved</span></div>
          <div className="left-pill">● {remaining} left</div>
        </div>
      </header>

      <div className="shell">
        <section className="hero">
          <span className="kicker">ADMIN • DASHBOARD</span>
          <h1>
            Every <span className="out">reservation</span>
          </h1>
        </section>

        <div className="meter">
          <div className="meter-row"><span className="mono">NFTS TAKEN</span><b className="mono">{pieces} / {SITE.totalSlots}</b></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (pieces / SITE.totalSlots) * 100)}%` }} /></div>
          <div className="meter-row"><small>{pendingCount + approvedCount} reservations • {pendingCount} pending</small><small>{remaining} remaining</small></div>
          {loadError && <p className="err">{loadError}</p>}
        </div>

        <div className="btnrow">
          <button className="btn" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="btn" onClick={exportCsv} disabled={visible.length === 0}>
            CSV ↓
          </button>
          <button className="btn" onClick={lock}>Lock</button>
        </div>
        {copied && <p className="hint" style={{ color: "#4ad69b", fontWeight: 700 }}>{copied}</p>}

        <div className="btnrow">
          <button
            className={`btn ${tab === "pending" ? "btn-p" : ""}`}
            onClick={() => setTab("pending")}
          >
            Pending ({pendingCount})
          </button>
          <button
            className={`btn ${tab === "approved" ? "btn-p" : ""}`}
            onClick={() => setTab("approved")}
          >
            Approved ({approvedCount})
          </button>
        </div>

        {visible.length === 0 && !loading && (
          <div className="card">
            <h2>{tab === "pending" ? "Queue clear" : "Nothing approved yet"}</h2>
            <p className="sub">
              {tab === "pending"
                ? "New mints from the home page show up here."
                : "Accepted reservations land here."}
            </p>
          </div>
        )}

        {visible.map((r) => {
          const st: ReservationStatus = r.status ?? "pending";
          const busy = busyWallet === r.wallet;
          return (
          <section className="card" key={r.wallet}>
            <div className="sec-label mono">
              <span style={{ color: STATUS_COLOR[st] }}>● {st.toUpperCase()}</span>
              {" • "}{r.wallet.slice(0, 10)}… • {age(r.createdAt)}
            </div>
            <h2 style={{ fontSize: 18 }}>@{r.handle.replace(/^@/, "")} <span style={{ color: "#4ad69b" }}>×{r.qty}</span></h2>
            <div>
              <div className="kv"><span>Wallet</span><b style={{ fontSize: 11, wordBreak: "break-all" }}>{r.wallet}</b></div>
              <div className="kv"><span>Handle check</span><b>{r.handleVerified ? "API ✓" : "format"}</b></div>
            </div>
            {tab === "pending" ? (
              <div className="btnrow">
                <button className="btn btn-p" disabled={busy} onClick={() => void setStatus(r.wallet, "accepted")}>
                  {busy ? "…" : "Accept ✓"}
                </button>
                <button className="btn btn-danger" disabled={busy} onClick={() => void setStatus(r.wallet, "rejected")}>
                  {busy ? "…" : "Reject ✕"}
                </button>
              </div>
            ) : (
              <div className="btnrow">
                <button className="btn btn-ghost" onClick={() => void copy(r.wallet, "Wallet")}>
                  Copy wallet
                </button>
                <button className="btn btn-ghost" onClick={() => setDeleteTarget(r)}>
                  Delete
                </button>
              </div>
            )}
          </section>
          );
        })}

        <footer>© 2026 {SITE.projectName} admin • unlisted page, keep the code secret</footer>
      </div>

      {deleteTarget && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(5,7,11,0.7)",
            display: "grid", placeItems: "center", padding: 16,
          }}
          onClick={() => { if (!deleting) setDeleteTarget(null); }}
        >
          <section
            className="card"
            style={{ maxWidth: 420, width: "100%", margin: 0, borderColor: "var(--bad)" }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm delete"
          >
            <div className="sec-label mono" style={{ color: "var(--bad)" }}>DELETE RESERVATION?</div>
            <h2 style={{ fontSize: 18 }}>
              @{deleteTarget.handle.replace(/^@/, "")}{" "}
              <span style={{ color: "#4ad69b" }}>×{deleteTarget.qty}</span>
            </h2>
            <div>
              <div className="kv">
                <span>Wallet</span>
                <b style={{ fontSize: 11, wordBreak: "break-all" }}>{deleteTarget.wallet}</b>
              </div>
            </div>
            <p className="err">This frees the slot permanently. It can't be undone.</p>
            <div className="btnrow">
              <button className="btn" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
