"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SITE, type Reservation } from "../lib/config";
import {
  createMintReservation,
  getMintStats,
  saveReservation,
  totalReserved,
  normHandle,
  validHandle,
  validWallet,
  type MintStats,
} from "../lib/store";

type TaskKey = "follow" | "like" | "rt" | "cmt";
const AUTO_DELAY = 6000; // fallback auto-confirm after X is opened
const RETURN_MIN = 2500; // min time away before a return counts as done

export default function Home() {
  const [step, setStep] = useState(1);
  const [handle, setHandle] = useState("");
  const [wallet, setWallet] = useState("");
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState<Record<TaskKey, boolean>>({ follow: false, like: false, rt: false, cmt: false });
  const [pending, setPending] = useState<Record<TaskKey, boolean>>({ follow: false, like: false, rt: false, cmt: false });
  const [booked, setBooked] = useState<Reservation | null>(null);
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false); // gate localStorage reads until after hydration
  const [formErr, setFormErr] = useState("");
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<MintStats | null>(null);
  const [dbDown, setDbDown] = useState(false);
  const [handleVerdict, setHandleVerdict] = useState<null | { ok: boolean; detail: string; api: boolean }>(null);
  const openedAt = useRef<Record<TaskKey, number>>({ follow: 0, like: 0, rt: 0, cmt: 0 });
  const timers = useRef<Partial<Record<TaskKey, ReturnType<typeof setTimeout>>>>({});

  // Server and first client render must match: DB stats load after mount.
  // Falls back to this device's counts when MongoDB is unreachable.
  const reserved = useMemo(
    () => (!mounted ? SITE.alreadyReserved : stats ? SITE.alreadyReserved + stats.pieces : totalReserved()),
    [mounted, stats, tick]
  );
  const left = Math.max(0, SITE.totalSlots - reserved);
  const soldOut = left <= 0;

  useEffect(() => {
    setMounted(true);
    getMintStats()
      .then((s) => {
        setStats(s);
        setDbDown(false);
      })
      .catch(() => setDbDown(true));
  }, []);

  function confirm(key: TaskKey) {
    setDone((d) => ({ ...d, [key]: true }));
    setPending((p) => ({ ...p, [key]: false }));
  }

  function locked(key: TaskKey): string | null {
    if (key === "follow") return null;
    if (!done.follow) return "Follow first";
    if (key === "cmt" && (!done.like || !done.rt)) return "Like + repost first";
    return null;
  }

  function doTask(key: TaskKey, url: string) {
    if (locked(key)) return;
    window.open(url, "_blank", "noopener");
    openedAt.current[key] = Date.now();
    if (done[key]) return;
    setPending((p) => ({ ...p, [key]: true }));
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => confirm(key), AUTO_DELAY);
  }

  // Auto-confirm when user comes back to this tab after doing the action on X
  useEffect(() => {
    function onReturn() {
      if (document.visibilityState === "hidden") return;
      (Object.keys(pending) as TaskKey[]).forEach((k) => {
        if (pending[k] && !done[k] && Date.now() - openedAt.current[k] > RETURN_MIN) {
          if (timers.current[k]) clearTimeout(timers.current[k]);
          confirm(k);
        }
      });
    }
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  });

  useEffect(() => () => {
    Object.values(timers.current).forEach((t) => t && clearTimeout(t));
  }, []);

  const tasksDone = done.follow && done.like && done.rt && done.cmt;

  function canNext(): boolean {
    if (soldOut && step !== 4) return false;
    if (step === 1) return validHandle(handle) && !checkingHandle;
    if (step === 2) return tasksDone;
    if (step === 3) {
      if (!validWallet(wallet)) return false;
      if (qty < 1 || qty > SITE.maxPerWallet) return false;
      if (qty > left) return false;
      if (submitting) return false;
      return true;
    }
    return true;
  }

  async function next() {
    if (!canNext()) return;
    // Step 1: verify the X handle against the server (existence check when keyed)
    if (step === 1) {
      setCheckingHandle(true);
      setHandleVerdict(null);
      try {
        const r = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle }),
        });
        const j = await r.json();
        if (j.mode === "verified" && j.exists === false) {
          setHandleVerdict({ ok: false, detail: "This X account was not found. Check spelling.", api: true });
          return;
        }
        if (j.mode === "verified" && j.exists === true) {
          setHandleVerdict({ ok: true, detail: "X account found.", api: true });
        } else {
          setHandleVerdict({ ok: true, detail: "Format OK. (Add X_BEARER_TOKEN for live existence checks.)", api: false });
        }
      } catch {
        setHandleVerdict({ ok: true, detail: "Format OK. (Server check skipped — offline.)", api: false });
      } finally {
        setCheckingHandle(false);
      }
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // reserve (server-enforced: uniques + 1000 cap)
    const h = normHandle(handle);
    const w = wallet.trim();
    setSubmitting(true);
    setFormErr("");
    try {
      await createMintReservation({
        handle: h,
        wallet: w,
        qty,
        tasks: { ...done },
        handleVerified: handleVerdict?.api === true,
        createdAt: Date.now(),
      });
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Could not save reservation — retry.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    const r: Reservation = {
      handle: h, wallet: w, qty, at: Date.now(),
      handleVerified: handleVerdict?.api === true,
      status: "pending",
    };
    try {
      saveReservation(r); // on-device mirror so claim lookup works offline
    } catch {
      /* ignore */
    }
    setBooked(r);
    setFormErr("");
    setStep(4);
    setTick((t) => t + 1);
    getMintStats()
      .then((s) => {
        setStats(s);
        setDbDown(false);
      })
      .catch(() => setDbDown(true));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const nextLabel =
    step === 1 ? (checkingHandle ? "Verifying…" : "Verify & continue →")
      : step === 2 ? "Continue to wallet →"
        : step === 3 ? (submitting ? "Reserving…" : `Reserve ${qty} NFT${qty > 1 ? "s" : ""}`)
          : "Done";

  function taskBtn(key: TaskKey, label: string) {
    if (done[key]) return { text: "Next →", cls: "btn btn-p" };
    if (pending[key]) return { text: "Checking… come back here", cls: "btn btn-x is-checking" };
    return { text: label, cls: "btn btn-x" };
  }

  function Task({ k, url, icon, title, desc, label }: {
    k: TaskKey; url: string; icon: string; title: string; desc: string; label: string;
  }) {
    const b = taskBtn(k, label);
    const isNext = done[k];
    const lockReason = locked(k);
    return (
      <div className={`task ${done[k] ? "done" : ""}`}>
        <div className="task-top">
          <div className="task-n">{done[k] ? "✓" : icon}</div>
          <div style={{ flex: 1 }}>
            <b>{title}</b><p>{desc}</p>
            <p className={`autostat ${done[k] ? "ok" : pending[k] ? "wait" : ""}`}>
              {done[k]
                ? "✓ auto-confirmed"
                : lockReason
                  ? `Locked — ${lockReason.toLowerCase()}`
                  : pending[k]
                    ? "● auto-checking — return to this page…"
                    : "○ auto — tap, do it on X, come back"}
            </p>
          </div>
        </div>
        <div className="btnrow">
          <button
            className={b.cls}
            disabled={isNext ? !canNext() : !!lockReason}
            onClick={() => (isNext ? next() : doTask(k, url))}
          >
            {b.text}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="nav">
        <div className="nav-in">
          <div className="badge-x">X</div>
          <div className="brand">
            <b>{SITE.projectName}</b>
            <span>{SITE.tokenSymbol} • X</span>
          </div>
          <div className="left-pill">● {left} left</div>
        </div>
      </header>

      <div className="shell">
        <section className="hero">
          <span className="kicker">OBLYX NFT PROMO • MAX {SITE.maxPerWallet} / WALLET</span>
          <h1>
            Reserve <span className="out">your NFTs</span> fast
          </h1>
        </section>

        <div className="meter">
          <div className="meter-row">
            <span className="mono">NFTS RESERVED</span>
            <b className="mono">{reserved} / {SITE.totalSlots}</b>
          </div>
          <div className="bar"><i style={{ width: `${Math.min(100, (reserved / SITE.totalSlots) * 100)}%` }} /></div>
          <div className="meter-row"><small>{left} NFTs remaining</small><small>1 wallet = 1 reservation</small></div>
          {dbDown && <div className="meter-row"><small style={{ color: "#f2b84e" }}>DB unreachable — showing this device's counts</small></div>}
        </div>

        {soldOut && step !== 4 && (
          <div className="card"><h2>All {SITE.totalSlots} Oblyx NFTs are gone</h2><p className="sub">Reservations closed.</p></div>
        )}

        {step < 4 && (
          <div className="dots">
            {[1, 2, 3].map((i) => (
              <i key={i} className={i < step ? "done" : i === step ? "on" : ""} />
            ))}
          </div>
        )}

        {step === 1 && (
          <section className="card tint-iris">
            <div className="sec-label mono">01 / YOUR X HANDLE</div>
            <h2>First — what's your X?</h2>
            <p className="sub">Used to tag your tasks. No password needed.</p>
            <label className="lbl" htmlFor="xh">X username</label>
            <input id="xh" placeholder="@yourhandle" maxLength={20} value={handle}
              onChange={(e) => { setHandle(e.target.value); setHandleVerdict(null); }} autoCapitalize="off" autoCorrect="off" />
            {handle && !validHandle(handle) && <p className="err">Invalid handle (1–15 chars: a–z, 0–9, _).</p>}
            {handleVerdict && (
              <p className={handleVerdict.ok ? "hint" : "err"} style={handleVerdict.ok ? { color: "#4ad69b", fontWeight: 700 } : undefined}>
                {handleVerdict.detail}
              </p>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="card">
            <div className="sec-label mono">02 / X TASKS • AUTO</div>
            <h2>Do the 4 tasks</h2>
            <p className="sub">Tap each, do it on X, come back — auto-confirmed in order.</p>
            <Task k="follow" url={SITE.xAccountUrl} icon="1" title={`Follow @${SITE.xAccount}`} desc="Opens the official account." label={`𝕏 Follow @${SITE.xAccount}`} />
            {done.follow && (
              <Task k="like" url={SITE.xPostUrl} icon="2" title="Like the post" desc="Tap the heart on X." label="𝕏 Like the post" />
            )}
            {done.like && (
              <Task k="rt" url={SITE.xPostUrl} icon="3" title="Repost it" desc="Repost (not quote)." label="𝕏 Repost it" />
            )}
            {done.rt && (
              <Task k="cmt" url={SITE.xPostUrl} icon="4" title="Comment on the post" desc="Then return here." label="𝕏 Comment now" />
            )}
          </section>
        )}

        {step === 3 && (
          <section className="card tint-lime">
            <div className="sec-label mono">03 / WALLET + NFTS</div>
            <div className="big-num">{qty}<span style={{ fontSize: 20 }}>/{SITE.maxPerWallet}</span></div>
            <h2>How many NFTs?</h2>
            <p className="sub">1 wallet = 1 reservation • max {SITE.maxPerWallet}. {left} left.</p>
            <label className="lbl" htmlFor="w">Wallet (to receive your Oblyx NFT)</label>
            <input id="w" placeholder="0x… EVM address" value={wallet}
              onChange={(e) => { setWallet(e.target.value); setFormErr(""); }}
              autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            {wallet && !validWallet(wallet) && <p className="err">Invalid wallet address.</p>}
            <label className="lbl">NFTs (max {SITE.maxPerWallet})</label>
            <div className="qty">
              <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="less">−</button>
              <b>{qty}</b>
              <button onClick={() => setQty(Math.min(SITE.maxPerWallet, qty + 1))} aria-label="more">+</button>
            </div>
            {qty > left && <p className="err">Only {left} NFTs left — lower quantity.</p>}
            {formErr && <p className="err">{formErr}</p>}
            <p className="hint">Double-check — wallet can't change after reserving.</p>
          </section>
        )}

        {step === 4 && booked && (
          <section className="card tint-gold" style={{ textAlign: "center" }}>
            <div className="sec-label mono">RESERVED • PENDING REVIEW</div>
            <h2>NFT reserved!</h2>
            <p className="sub">Screenshot this. Claim opens later — just connect with this wallet.</p>
            <div style={{ textAlign: "left" }}>
              <div className="kv"><span>X handle</span><b>@{booked.handle} {booked.handleVerified ? "✓" : ""}</b></div>
              <div className="kv"><span>Wallet</span><b style={{ fontSize: 11, wordBreak: "break-all" }}>{booked.wallet}</b></div>
              <div className="kv"><span>NFTs</span><b>{booked.qty} / {SITE.maxPerWallet}</b></div>
            </div>
          </section>
        )}

        <footer>&copy; 2026 {SITE.projectName} • 1 wallet = 1 reservation</footer>
      </div>

      {step !== 4 && (
        <nav className="bottomnav">
          <div className="bottomnav-in">
            {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
            <button className="btn btn-p" disabled={!canNext()} onClick={next}>
              {soldOut ? "Sold out" : nextLabel}
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
