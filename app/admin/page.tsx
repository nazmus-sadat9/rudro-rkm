"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SITE } from "../../lib/config";
import { listMintsAdmin, removeMintAdmin, type MintRow } from "../../lib/store";

const ADMIN_SESSION_KEY = "oblyx-admin-code";

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
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

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
    const head = ["code", "handle", "wallet", "qty", "handleVerified", "createdAt"].join(",");
    const body = rows.map((r) =>
      [r.code, r.handle, r.wallet, r.qty, r.handleVerified, r.createdAt].join(",")
    );
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oblyx-reservations.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pieces = useMemo(() => rows.reduce((n, r) => n + r.qty, 0), [rows]);
  const remaining = Math.max(0, SITE.totalSlots - SITE.alreadyReserved - pieces);

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
          <div className="brand"><b>Oblyx Admin</b><span>{rows.length} reservations</span></div>
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
          <div className="meter-row"><small>{rows.length} reservations</small><small>{remaining} remaining</small></div>
          {loadError && <p className="err">{loadError}</p>}
        </div>

        <div className="btnrow">
          <button className="btn" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>
            CSV ↓
          </button>
          <button className="btn" onClick={lock}>Lock</button>
        </div>
        {copied && <p className="hint" style={{ color: "#4ad69b", fontWeight: 700 }}>{copied}</p>}

        {rows.length === 0 && !loading && (
          <div className="card"><h2>No reservations yet</h2><p className="sub">New mints from the home page show up here.</p></div>
        )}

        {rows.map((r) => (
          <section className="card" key={r.code}>
            <div className="sec-label mono">{r.code} • {age(r.createdAt)}</div>
            <h2 style={{ fontSize: 18 }}>@{r.handle.replace(/^@/, "")} <span style={{ color: "#4ad69b" }}>×{r.qty}</span></h2>
            <div>
              <div className="kv"><span>Wallet</span><b style={{ fontSize: 11, wordBreak: "break-all" }}>{r.wallet}</b></div>
              <div className="kv"><span>Handle check</span><b>{r.handleVerified ? "API ✓" : "format"}</b></div>
              <div className="kv"><span>Code</span><b style={{ fontSize: 12 }}>{r.code}</b></div>
            </div>
            {confirmCode === r.code ? (
              <>
                <p className="err">Delete this reservation permanently?</p>
                <div className="btnrow">
                  <button className="btn" onClick={() => setConfirmCode(null)}>Cancel</button>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      removeMintAdmin(r.code, adminCode)
                        .then(() => {
                          setConfirmCode(null);
                          setCopied("Reservation deleted");
                          window.setTimeout(() => setCopied(""), 2000);
                          return refresh();
                        })
                        .catch(() => setLoadError("Could not delete reservation."));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <div className="btnrow">
                <button className="btn btn-ghost" onClick={() => void copy(r.wallet, "Wallet")}>
                  Copy wallet
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmCode(r.code)}>
                  Delete
                </button>
              </div>
            )}
          </section>
        ))}

        <footer>© 2026 {SITE.projectName} admin • unlisted page, keep the code secret</footer>
      </div>
    </>
  );
}
