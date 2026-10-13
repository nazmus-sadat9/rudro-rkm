"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SITE, type Reservation } from "@/lib/config";
import {
  createMintReservation,
  getMintStats,
  saveReservation,
  totalReserved,
  normHandle,
  validHandle,
  validWallet,
  makeCode,
  type MintStats,
} from "@/lib/store";
import {
  FieldLabel,
  FormMessage,
  Shell,
  SiteHeader,
  TextInput,
  Toast,
  cn,
} from "@/components/ui";

type TaskKey = "follow" | "like" | "rt" | "cmt";
const AUTO_DELAY = 6000; // fallback auto-confirm after X is opened
const RETURN_MIN = 2500; // min time away before a return counts as done

export default function Home(): React.JSX.Element {
  const [mounted, setMounted] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1);
  const [handle, setHandle] = useState<string>("");
  const [checkingHandle, setCheckingHandle] = useState<boolean>(false);
  const [handleVerdict, setHandleVerdict] = useState<null | {
    ok: boolean;
    detail: string;
    api: boolean;
  }>(null);

  const [done, setDone] = useState<Record<TaskKey, boolean>>({
    follow: false,
    like: false,
    rt: false,
    cmt: false,
  });
  const [pending, setPending] = useState<Record<TaskKey, boolean>>({
    follow: false,
    like: false,
    rt: false,
    cmt: false,
  });
  const openedAt = useRef<Record<TaskKey, number>>({ follow: 0, like: 0, rt: 0, cmt: 0 });
  const timers = useRef<Partial<Record<TaskKey, ReturnType<typeof setTimeout>>>>({});

  const [wallet, setWallet] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [saved, setSaved] = useState<Reservation | null>(null);
  const [toast, setToast] = useState<string>("");
  const [tick, setTick] = useState<number>(0);
  const [stats, setStats] = useState<MintStats | null>(null);
  const [dbDown, setDbDown] = useState<boolean>(false);

  const showToast = useCallback((msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  useEffect(() => {
    setMounted(true);
    getMintStats()
      .then((s: MintStats) => {
        setStats(s);
        setDbDown(false);
      })
      .catch(() => setDbDown(true));
  }, []);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach((t) => t && clearTimeout(t));
    },
    []
  );

  // Server and first client render must match: DB stats load after mount.
  const reserved = useMemo(
    () =>
      !mounted
        ? SITE.alreadyReserved
        : stats
          ? SITE.alreadyReserved + stats.pieces
          : totalReserved(),
    [mounted, stats, tick]
  );
  const left = Math.max(0, SITE.totalSlots - reserved);
  const soldOut = left <= 0;
  const pct: number = Math.min(100, Math.round((reserved / SITE.totalSlots) * 100));

  const handleOk = handleVerdict !== null && handleVerdict.ok;
  const tasksDone = done.follow && done.like && done.rt && done.cmt;
  const doneCount: number = (Object.keys(done) as TaskKey[]).filter((k) => done[k]).length;
  const walletOk = validWallet(wallet);
  const qtyOk =
    Number.isInteger(qty) && qty >= 1 && qty <= SITE.maxPerWallet && qty <= left;

  function confirm(key: TaskKey): void {
    setDone((d) => ({ ...d, [key]: true }));
    setPending((p) => ({ ...p, [key]: false }));
    showToast("Task confirmed");
  }

  function locked(key: TaskKey): string | null {
    if (key === "follow") return null;
    if (!done.follow) return "Follow first";
    if (key === "cmt" && (!done.like || !done.rt)) return "Like + repost first";
    return null;
  }

  function doTask(key: TaskKey, url: string): void {
    if (locked(key) !== null) return;
    window.open(url, "_blank", "noopener");
    openedAt.current[key] = Date.now();
    if (done[key]) return;
    setPending((p) => ({ ...p, [key]: true }));
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => confirm(key), AUTO_DELAY);
  }

  // Auto-confirm when the user returns to this tab after acting on X.
  useEffect(() => {
    function onReturn(): void {
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

  async function verifyHandle(): Promise<void> {
    if (!validHandle(handle) || checkingHandle) return;
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
        setHandleVerdict({
          ok: false,
          detail: "This X account was not found. Check spelling.",
          api: true,
        });
        return;
      }
      if (j.mode === "verified" && j.exists === true) {
        setHandleVerdict({ ok: true, detail: "X account found — tasks unlocked.", api: true });
      } else {
        setHandleVerdict({
          ok: true,
          detail: "Format OK — tasks unlocked. (Add X_BEARER_TOKEN for live existence checks.)",
          api: false,
        });
      }
      showToast("Handle verified");
    } catch {
      setHandleVerdict({
        ok: true,
        detail: "Format OK — tasks unlocked. (Server check skipped.)",
        api: false,
      });
    } finally {
      setCheckingHandle(false);
    }
  }

  function goStep(n: number): void {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copy(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`);
    } catch {
      showToast("Copy failed — select and copy manually");
    }
  }

  function refreshStats(): void {
    getMintStats()
      .then((s: MintStats) => {
        setStats(s);
        setDbDown(false);
      })
      .catch(() => setDbDown(true));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    const h = normHandle(handle);
    const w = wallet.trim();
    if (!validHandle(handle) || !handleOk) {
      setError("Step 1: verify your X handle first.");
      return;
    }
    if (!tasksDone) {
      setError(`Step 2: ${doneCount}/4 tasks confirmed — finish all 4 first.`);
      return;
    }
    if (!walletOk) {
      setError("Enter a valid wallet address (0x… or Solana).");
      return;
    }
    if (!qtyOk) {
      setError(`Quantity must be 1–${SITE.maxPerWallet} and fit the remaining supply.`);
      return;
    }
    if (soldOut) {
      setError("Sold out — all 1,000 NFTs are taken.");
      return;
    }
    const c = makeCode();
    setSubmitting(true);
    try {
      await createMintReservation({
        code: c,
        handle: h,
        wallet: w,
        qty,
        tasks: { ...done },
        handleVerified: handleVerdict?.api === true,
        createdAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save reservation — retry.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    const record: Reservation = {
      handle: h,
      wallet: w,
      qty,
      code: c,
      at: Date.now(),
      handleVerified: handleVerdict?.api === true,
    };
    try {
      saveReservation(record); // on-device mirror so claim lookup works offline
    } catch {
      /* ignore */
    }
    setSaved(record);
    setTick((t: number) => t + 1);
    refreshStats();
    showToast("NFTs reserved");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startOver(): void {
    setSaved(null);
    setStep(1);
    setHandle("");
    setHandleVerdict(null);
    setDone({ follow: false, like: false, rt: false, cmt: false });
    setPending({ follow: false, like: false, rt: false, cmt: false });
    setWallet("");
    setQty(1);
    setError("");
  }

  return (
    <Shell>
      <SiteHeader
        tag="NFT"
        badge={soldOut ? "SOLD OUT" : `${left.toLocaleString("en-US")} LEFT`}
        badgeTone={soldOut ? "warn" : "ok"}
        links={[
          { href: "#top", label: "Mint" },
          { href: "#progress", label: "Supply" },
          { href: "#how", label: "How it works" },
        ]}
      />

      <main id="top" className="ob-scroll-anchor">
        <section className="ob-hero">
          <span className="ob-kicker">
            <span aria-hidden="true" className="ob-kicker-bar" />
            1,000-SUPPLY ALLOWLIST
          </span>
          <h1 className="ob-title">
            Reserve your <em>Oblyx NFTs.</em>
          </h1>
          <p className="ob-lead">
            Enter your X handle, finish 4 X tasks, then reserve up to {SITE.maxPerWallet}{" "}
            NFTs with one wallet. One wallet = one reservation, max once.
          </p>
          <div className="ob-chips">
            <span className="ob-chip">
              Supply: <b>{SITE.totalSlots.toLocaleString("en-US")}</b>
            </span>
            <span className="ob-chip">
              Max: <b>{SITE.maxPerWallet} / wallet</b>
            </span>
            <span className="ob-chip">
              Tasks: <b>{doneCount}/4</b>
            </span>
          </div>
        </section>

        <section id="progress" className="ob-panel ob-scroll-anchor" aria-label="Allowlist progress">
          <div className="ob-panel-head">
            <h2>Reserved · out of {SITE.totalSlots.toLocaleString("en-US")}</h2>
            <span className="ob-panel-count">
              <b>{reserved.toLocaleString("en-US")}</b> / {SITE.totalSlots.toLocaleString("en-US")}{" "}
              taken
            </span>
          </div>
          <div
            className="ob-progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="ob-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="ob-stats">
            {[
              { k: "RESERVATIONS", v: stats === null ? "—" : String(stats.count) },
              { k: "NFTS TAKEN", v: String(reserved) },
              { k: "REMAINING", v: String(left) },
            ].map((s, i) => (
              <div key={s.k} className={cn("ob-stat", i === 2 && "ob-stat--wide")}>
                <small>{s.k}</small>
                <strong>{s.v}</strong>
              </div>
            ))}
          </div>
          {dbDown && (
            <p className="ob-alert">Database unreachable — showing this device&apos;s counts.</p>
          )}
        </section>

        {saved !== null ? (
          <section className="ob-card" aria-label="Reservation confirmed">
            <div className="ob-card-head">
              <span className="ob-card-num">✓</span>
              <div>
                <h2>NFTs reserved</h2>
                <p>
                  @{saved.handle}
                  {saved.handleVerified ? " ✓" : ""} · {saved.qty} NFT
                  {saved.qty === 1 ? "" : "s"} · keep your code safe.
                </p>
              </div>
            </div>
            <dl className="ob-facts">
              <div className="ob-fact-row">
                <dt>X HANDLE</dt>
                <dd>@{saved.handle}</dd>
              </div>
              <div className="ob-fact-row">
                <dt>WALLET</dt>
                <dd>{saved.wallet}</dd>
              </div>
              <div className="ob-fact-row">
                <dt>NFTS</dt>
                <dd className="ob-hl">×{saved.qty}</dd>
              </div>
            </dl>
            <div className="ob-codebox">
              <span>RESERVATION CODE (PRIVATE — NEEDED FOR CLAIM)</span>
              <code>{saved.code}</code>
            </div>
            <div className="ob-form">
              <button
                type="button"
                onClick={() => void copy(saved.code, "Reservation code")}
                className="ob-btn ob-btn--ghost"
              >
                Copy reservation code
              </button>
              <button type="button" onClick={startOver} className="ob-btn ob-btn--ghost">
                Make another reservation →
              </button>
            </div>
            <p className="ob-msg">
              Saved in this browser. Screenshot the code — it is the only way to find your
              reservation again.
            </p>
          </section>
        ) : (
          <>
            <p className="ob-msg">Step {step} of 3 — handle → tasks → wallet.</p>

            {step === 1 && (
              <section className="ob-card ob-scroll-anchor" aria-label="Step 1 — X handle">
                <div className="ob-card-head">
                  <span className="ob-card-num">1</span>
                  <div>
                    <h2>Your X handle</h2>
                    <p>Start here — tasks unlock once your handle is verified.</p>
                  </div>
                </div>
                <div className="ob-form">
                  <FieldLabel htmlFor="ob-x-handle">X HANDLE</FieldLabel>
                  <TextInput
                    id="ob-x-handle"
                    value={handle}
                    placeholder="@your_handle"
                    onChange={(v: string) => {
                      setHandle(v);
                      setHandleVerdict(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void verifyHandle()}
                    disabled={!validHandle(handle) || checkingHandle || soldOut}
                    className="ob-btn"
                  >
                    {checkingHandle
                      ? "Verifying…"
                      : handleOk
                        ? "Verified — continue →"
                        : "Verify handle →"}
                  </button>
                  <p className="ob-note">
                    {handle.trim() === ""
                      ? "1–15 chars: letters, numbers, _ — with or without @."
                      : !validHandle(handle)
                        ? "That handle looks invalid — check spelling."
                        : handleVerdict !== null
                          ? handleVerdict.detail
                          : "Hit verify to unlock the tasks."}
                  </p>
                  {handleOk && (
                    <button type="button" onClick={() => goStep(2)} className="ob-btn ob-btn--ghost">
                      Continue to tasks →
                    </button>
                  )}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="ob-card ob-scroll-anchor" aria-label="Step 2 — X tasks">
                <div className="ob-card-head">
                  <span className="ob-card-num">2</span>
                  <div>
                    <h2>Do the 4 X tasks ({doneCount}/4)</h2>
                    <p>Open each link, do it on X, come back — auto-confirmed in order.</p>
                  </div>
                </div>
                <div className="ob-form">
                  <AutoTaskRow
                    step="2.1"
                    title={`Follow @${SITE.xAccount}`}
                    url={SITE.xAccountUrl}
                    linkLabel="Open profile"
                    lockedMsg={locked("follow") !== null ? "Verify your X handle first" : null}
                    done={done.follow}
                    pending={pending.follow}
                    onOpen={() => doTask("follow", SITE.xAccountUrl)}
                  />
                  {done.follow && (
                    <AutoTaskRow
                      step="2.2"
                      title="Like the post"
                      url={SITE.xPostUrl}
                      linkLabel="Open post"
                      lockedMsg={null}
                      done={done.like}
                      pending={pending.like}
                      onOpen={() => doTask("like", SITE.xPostUrl)}
                    />
                  )}
                  {done.like && (
                    <AutoTaskRow
                      step="2.3"
                      title="Repost it"
                      url={SITE.xPostUrl}
                      linkLabel="Open post"
                      lockedMsg={null}
                      done={done.rt}
                      pending={pending.rt}
                      onOpen={() => doTask("rt", SITE.xPostUrl)}
                    />
                  )}
                  {done.rt && (
                    <AutoTaskRow
                      step="2.4"
                      title="Comment on the post"
                      url={SITE.xPostUrl}
                      linkLabel="Open post"
                      lockedMsg={null}
                      done={done.cmt}
                      pending={pending.cmt}
                      onOpen={() => doTask("cmt", SITE.xPostUrl)}
                    />
                  )}
                  <button type="button" onClick={() => goStep(1)} className="ob-link-btn">
                    ← Back to handle
                  </button>
                  <button
                    type="button"
                    onClick={() => goStep(3)}
                    disabled={!tasksDone || soldOut}
                    className="ob-btn"
                  >
                    Continue to wallet →
                  </button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="ob-card ob-scroll-anchor" aria-label="Step 3 — Reserve NFTs">
                <div className="ob-card-head">
                  <span className="ob-card-num">3</span>
                  <div>
                    <h2>Wallet + NFTs</h2>
                    <p>
                      One wallet reserves once, max {SITE.maxPerWallet} NFTs.
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={(e: React.FormEvent<HTMLFormElement>) => void submit(e)}
                  className="ob-form"
                >
                  <FieldLabel htmlFor="ob-wallet">WALLET (RECEIVES YOUR NFTS)</FieldLabel>
                  <TextInput
                    id="ob-wallet"
                    value={wallet}
                    placeholder="0x… or Solana address"
                    onChange={(v: string) => {
                      setWallet(v);
                      setError("");
                    }}
                  />
                  <FieldLabel>NFTS (MAX {SITE.maxPerWallet})</FieldLabel>
                  <div className="ob-seg" role="group" aria-label="Quantity">
                    {Array.from({ length: SITE.maxPerWallet }, (_, i: number) => i + 1).map(
                      (n: number) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setQty(n)}
                          aria-pressed={qty === n}
                          className={cn("ob-seg-btn", qty === n && "ob-seg-btn--on")}
                        >
                          {n}
                        </button>
                      )
                    )}
                  </div>
                  <p className="ob-note">
                    {wallet.trim() === ""
                      ? "Double-check it — the wallet can't be changed after reserving."
                      : walletOk
                        ? "Wallet looks valid."
                        : "That doesn't look like a valid wallet address."}
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || soldOut || !handleOk || !tasksDone || !walletOk || !qtyOk}
                    className="ob-btn"
                  >
                    {soldOut
                      ? "Sold out — all 1,000 taken"
                      : submitting
                        ? "Reserving…"
                        : `Reserve ${qty} NFT${qty === 1 ? "" : "s"} →`}
                  </button>
                  <button type="button" onClick={() => goStep(2)} className="ob-link-btn">
                    ← Back to tasks
                  </button>
                </form>
                <FormMessage
                  tone={error !== "" ? "error" : ""}
                  text={
                    error !== ""
                      ? error
                      : soldOut
                        ? "Sold out — all 1,000 NFTs are taken."
                        : !handleOk
                          ? "Step 1: verify your X handle."
                          : !tasksDone
                            ? `Step 2: ${doneCount}/4 tasks confirmed — finish all 4 to unlock reserving.`
                            : "All checks green — hit reserve."
                  }
                />
                {!soldOut && left < qty && (
                  <p className="ob-warnbox">Only {left} left — lower your quantity to fit.</p>
                )}
              </section>
            )}
          </>
        )}

        <ol id="how" className="ob-steps ob-scroll-anchor" aria-label="How it works">
          {[
            { h: "Handle first", p: "One X handle = one reservation. Handles can't be reused." },
            { h: "Prove you're real", p: "Follow, like + repost, comment — auto-confirmed in order." },
            { h: "One wallet, once", p: `A wallet can reserve a single time, max ${SITE.maxPerWallet} NFTs.` },
            { h: "1,000 cap", p: "When all 1,000 are gone, reserving closes automatically." },
          ].map((s, i) => (
            <li key={s.h} className="ob-step">
              <span aria-hidden="true" className="ob-step-num">
                {i + 1}
              </span>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </li>
          ))}
        </ol>

        <p className="ob-foot">
          The /claim page stays hidden. Task checks are guided (open → auto-confirm), not
          X-API checked — full proof needs Login with X + paid API reads.
        </p>
      </main>

      <Toast message={toast} />
    </Shell>
  );
}

type AutoTaskRowProps = Readonly<{
  step: string;
  title: string;
  url: string;
  linkLabel: string;
  lockedMsg: string | null;
  done: boolean;
  pending: boolean;
  onOpen: () => void;
}>;

function AutoTaskRow({
  step,
  title,
  url,
  linkLabel,
  lockedMsg,
  done,
  pending,
  onOpen,
}: AutoTaskRowProps): React.JSX.Element {
  return (
    <div className={cn("ob-task", lockedMsg !== null && "ob-task--locked")}>
      <input type="checkbox" checked={done} readOnly tabIndex={-1} aria-label={`${title} done`} />
      <div className="ob-task-body">
        <strong>
          <span className="ob-task-step">{step} · </span>
          {title} {done && <span className="ob-stamp">✓ auto-confirmed</span>}
        </strong>
        {!done && lockedMsg !== null && (
          <span className="ob-stamp ob-stamp--idle">{lockedMsg}</span>
        )}
        {!done && lockedMsg === null && !pending && (
          <span className="ob-stamp ob-stamp--idle">1) open → 2) do it → 3) come back</span>
        )}
        {!done && lockedMsg === null && pending && (
          <span className="ob-stamp">Opened — do it on X, come back here</span>
        )}
        <div className="ob-task-actions">
          {lockedMsg !== null ? (
            <span className="ob-open-btn ob-open-btn--disabled">{linkLabel} ↗</span>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpen}
              className="ob-open-btn"
            >
              {done ? "Open again ↗" : `${linkLabel} ↗`}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
