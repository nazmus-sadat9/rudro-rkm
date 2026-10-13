"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getReservation,
  getReservationStats,
  saveReservationAsync,
  type Reservation,
  type ReservationStats,
} from "@/lib/reservations";
import {
  COMMENT_LABEL,
  COMMENT_URL,
  FOLLOW_HANDLE,
  FOLLOW_URL,
  LIKE_REPOST_LABEL,
  LIKE_REPOST_URL,
  MAX_PER_WALLET,
  RESERVATION_SESSION_KEY,
  SUPPLY_LIMIT,
} from "@/lib/quest";
import {
  FieldLabel,
  FormMessage,
  Shell,
  SiteHeader,
  TextInput,
  Toast,
  cn,
} from "@/components/ui";

const XHANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;
const BC1P_RE = /^bc1p[023456789ac-hj-np-z]{58}$/;

function newToken(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
  }
}

function normalizeDisplay(raw: string): string {
  const v = raw.trim();
  return v.startsWith("@") ? v : `@${v}`;
}

export default function Home(): React.JSX.Element {
  const [stats, setStats] = useState<ReservationStats | null>(null);
  const [statsError, setStatsError] = useState<string>("");

  const [xHandle, setXHandle] = useState<string>("");
  const [tasks, setTasks] = useState<{ follow: boolean; likeRepost: boolean; comment: boolean }>({
    follow: false,
    likeRepost: false,
    comment: false,
  });
  const [taskAt, setTaskAt] = useState<{ follow: number; likeRepost: number; comment: number }>({
    follow: 0,
    likeRepost: 0,
    comment: 0,
  });
  const [opened, setOpened] = useState<{ follow: boolean; likeRepost: boolean; comment: boolean }>({
    follow: false,
    likeRepost: false,
    comment: false,
  });

  const [wallet, setWallet] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [saved, setSaved] = useState<Reservation | null>(null);
  const [toast, setToast] = useState<string>("");

  const showToast = useCallback((msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const refreshStats = useCallback(async (): Promise<void> => {
    try {
      setStats(await getReservationStats());
      setStatsError("");
    } catch {
      setStatsError("Stats unavailable — database may be unreachable.");
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  // Resume a reservation made in this browser.
  useEffect(() => {
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(RESERVATION_SESSION_KEY);
    } catch {
      token = null;
    }
    if (token === null || token === "") return;
    getReservation(token)
      .then((r: Reservation | null) => {
        if (r === null) return;
        setSaved(r);
        setXHandle(r.xHandle);
        setTasks({ ...r.tasks });
        setTaskAt(r.taskAt ?? { follow: 0, likeRepost: 0, comment: 0 });
        setWallet(r.wallet);
        setQuantity(r.quantity);
      })
      .catch(() => {
        /* ignore — stats error already covers DB issues */
      });
  }, []);

  const handleValid: boolean = useMemo(() => XHANDLE_RE.test(xHandle.trim()), [xHandle]);
  const tasksDone: boolean = tasks.follow && tasks.likeRepost && tasks.comment;
  const doneCount: number = [tasks.follow, tasks.likeRepost, tasks.comment].filter(Boolean).length;
  const walletValid: boolean = useMemo(() => BC1P_RE.test(wallet.trim()), [wallet]);
  const soldOut: boolean = stats !== null && stats.soldOut;

  const markOpened = (key: "follow" | "likeRepost" | "comment"): void => {
    setOpened((o) => ({ ...o, [key]: true }));
  };

  const verifyTask = (key: "follow" | "likeRepost" | "comment"): void => {
    if (!handleValid) {
      showToast("Enter your X handle first");
      return;
    }
    if (!opened[key]) {
      showToast("Open the post first, then verify");
      return;
    }
    const now = Date.now();
    setTasks((t) => ({ ...t, [key]: true }));
    setTaskAt((s) => ({ ...s, [key]: s[key] > 0 ? s[key] : now }));
    showToast("Task verified ✓");
  };

  const resetTasks = (): void => {
    setTasks({ follow: false, likeRepost: false, comment: false });
    setTaskAt({ follow: 0, likeRepost: 0, comment: 0 });
    setOpened({ follow: false, likeRepost: false, comment: false });
  };

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

  const submit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError("");
    const handle = xHandle.trim();
    const cleanWallet = wallet.trim();
    if (!XHANDLE_RE.test(handle)) {
      setError("Enter a valid X handle (1–15 chars, letters/numbers/_).");
      return;
    }
    if (!tasksDone) {
      setError("Complete all 3 X tasks first.");
      return;
    }
    if (!BC1P_RE.test(cleanWallet)) {
      setError("Enter a valid bc1p Taproot address.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PER_WALLET) {
      setError(`Quantity must be 1–${MAX_PER_WALLET}.`);
      return;
    }
    if (soldOut) {
      setError("Sold out — all 1,000 slots are taken.");
      return;
    }
    setSubmitting(true);
    try {
      const token = newToken();
      const record: Reservation = {
        token,
        xHandle: normalizeDisplay(handle),
        xHandleLower: handle.replace(/^@/, "").toLowerCase(),
        wallet: cleanWallet,
        quantity,
        tasks: { ...tasks },
        taskAt: { ...taskAt },
        createdAt: Date.now(),
      };
      const { token: returned } = await saveReservationAsync(record);
      const finalRecord: Reservation = { ...record, token: returned };
      setSaved(finalRecord);
      try {
        sessionStorage.setItem(RESERVATION_SESSION_KEY, returned);
      } catch {
        /* ignore */
      }
      showToast("Slots reserved ✓");
      void refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save reservation");
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = (): void => {
    setSaved(null);
    setXHandle("");
    resetTasks();
    setWallet("");
    setQuantity(1);
    setError("");
    try {
      sessionStorage.removeItem(RESERVATION_SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const pct: number =
    stats === null ? 0 : Math.min(100, Math.round((stats.pieces / SUPPLY_LIMIT) * 100));

  return (
    <Shell>
      <SiteHeader
        tag="ALLOWLIST"
        badge={
          stats === null
            ? statsError !== ""
              ? "DB UNREACHABLE"
              : "LOADING…"
            : soldOut
              ? "SOLD OUT"
              : `${stats.remaining.toLocaleString("en-US")} SLOTS LEFT`
        }
        badgeTone={stats === null || soldOut || statsError !== "" ? "warn" : "ok"}
        links={[
          { href: "#handle", label: "1 · Handle" },
          { href: "#tasks", label: "2 · Tasks" },
          { href: "#reserve", label: "3 · Reserve" },
        ]}
      />

      <main>
        <section className="ob-hero">
          <span className="ob-kicker">
            <span aria-hidden="true" className="ob-kicker-bar" />
            1,000-SLOT ALLOWLIST
          </span>
          <h1 className="ob-title">
            Claim your slot in <em>3 steps.</em>
          </h1>
          <p className="ob-lead">
            Enter your X handle, finish 3 X tasks, then reserve up to {MAX_PER_WALLET} slots with
            one Taproot wallet. One wallet = one reservation, max once.
          </p>
          <div className="ob-chips">
            <span className="ob-chip">
              Supply: <b>{SUPPLY_LIMIT.toLocaleString("en-US")}</b>
            </span>
            <span className="ob-chip">
              Max: <b>{MAX_PER_WALLET} / wallet</b>
            </span>
            <span className="ob-chip">
              Tasks: <b>{doneCount}/3</b>
            </span>
          </div>
        </section>

        <section className="ob-panel" aria-label="Allowlist progress">
          <div className="ob-panel-head">
            <h2>Slots taken · out of {SUPPLY_LIMIT.toLocaleString("en-US")}</h2>
            <span className="ob-panel-count">
              <b>{stats === null ? "—" : stats.pieces.toLocaleString("en-US")}</b> /{" "}
              {SUPPLY_LIMIT.toLocaleString("en-US")} taken
            </span>
          </div>
          <div className="ob-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span className="ob-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="ob-stats">
            {[
              { k: "RESERVATIONS", v: stats === null ? "—" : String(stats.count) },
              { k: "SLOTS TAKEN", v: stats === null ? "—" : String(stats.pieces) },
              { k: "REMAINING", v: stats === null ? "—" : String(stats.remaining) },
            ].map((s, i) => (
              <div key={s.k} className={cn("ob-stat", i === 2 && "ob-stat--wide")}>
                <small>{s.k}</small>
                <strong>{s.v}</strong>
              </div>
            ))}
          </div>
          {statsError !== "" && <p className="ob-alert">{statsError}</p>}
        </section>

        {saved !== null ? (
          <section className="ob-card" aria-label="Reservation confirmed">
            <div className="ob-card-head">
              <span className="ob-card-num">✓</span>
              <div>
                <h2>Slots reserved</h2>
                <p>
                  {saved.xHandle} · {saved.quantity} slot{saved.quantity === 1 ? "" : "s"} · keep
                  your recovery code safe.
                </p>
              </div>
            </div>
            <dl className="ob-facts">
              <div className="ob-fact-row">
                <dt>X HANDLE</dt>
                <dd>{saved.xHandle}</dd>
              </div>
              <div className="ob-fact-row">
                <dt>WALLET</dt>
                <dd>{saved.wallet}</dd>
              </div>
              <div className="ob-fact-row">
                <dt>SLOTS</dt>
                <dd className="ob-hl">×{saved.quantity}</dd>
              </div>
            </dl>
            <div className="ob-codebox">
              <span>RECOVERY CODE (PRIVATE — NEEDED TO LOOK UP YOUR SPOT)</span>
              <code>{saved.token}</code>
            </div>
            <div className="ob-form">
              <button type="button" onClick={() => void copy(saved.token, "Recovery code")} className="ob-btn ob-btn--ghost">
                Copy recovery code
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
          <form onSubmit={(e) => void submit(e)}>
            {/* STEP 1 */}
            <section id="handle" className="ob-card ob-scroll-anchor" aria-label="Step 1 — X handle">
              <div className="ob-card-head">
                <span className="ob-card-num">1</span>
                <div>
                  <h2>Your X handle</h2>
                  <p>Start here — tasks unlock once your handle is valid.</p>
                </div>
              </div>
              <div className="ob-form">
                <FieldLabel htmlFor="ob-x-handle">X HANDLE</FieldLabel>
                <TextInput
                  id="ob-x-handle"
                  value={xHandle}
                  placeholder="@your_handle"
                  onChange={(v: string) => setXHandle(v)}
                />
                <p className="ob-note">
                  {xHandle.trim() === ""
                    ? "1–15 chars: letters, numbers, _ — with or without @."
                    : handleValid
                      ? `Locked in as ${normalizeDisplay(xHandle)} — now do the tasks below.`
                      : "That handle looks invalid — check spelling."}
                </p>
              </div>
            </section>

            {/* STEP 2 */}
            <section id="tasks" className="ob-card ob-scroll-anchor" aria-label="Step 2 — X tasks">
              <div className="ob-card-head">
                <span className="ob-card-num">2</span>
                <div>
                  <h2>Do the 3 X tasks ({doneCount}/3)</h2>
                  <p>Open each link, complete it, then hit Verify.</p>
                </div>
              </div>
              <div className="ob-form">
                <TaskRow
                  step="2.1"
                  title={`Follow ${FOLLOW_HANDLE}`}
                  url={FOLLOW_URL}
                  linkLabel="Open profile"
                  locked={!handleValid}
                  lockedHint="Enter your X handle first"
                  done={tasks.follow}
                  opened={opened.follow}
                  onOpen={() => markOpened("follow")}
                  onVerify={() => verifyTask("follow")}
                />
                <TaskRow
                  step="2.2"
                  title={LIKE_REPOST_LABEL}
                  url={LIKE_REPOST_URL}
                  linkLabel="Open post"
                  locked={!handleValid || !tasks.follow}
                  lockedHint={!handleValid ? "Enter your X handle first" : "Follow first"}
                  done={tasks.likeRepost}
                  opened={opened.likeRepost}
                  onOpen={() => markOpened("likeRepost")}
                  onVerify={() => verifyTask("likeRepost")}
                />
                <TaskRow
                  step="2.3"
                  title={COMMENT_LABEL}
                  url={COMMENT_URL}
                  linkLabel="Open post"
                  locked={!handleValid || !tasks.likeRepost}
                  lockedHint={!handleValid ? "Enter your X handle first" : "Like + repost first"}
                  done={tasks.comment}
                  opened={opened.comment}
                  onOpen={() => markOpened("comment")}
                  onVerify={() => verifyTask("comment")}
                />
                {doneCount > 0 && (
                  <button type="button" onClick={resetTasks} className="ob-link-btn">
                    Reset tasks
                  </button>
                )}
              </div>
            </section>

            {/* STEP 3 */}
            <section id="reserve" className="ob-card ob-scroll-anchor" aria-label="Step 3 — Reserve slots">
              <div className="ob-card-head">
                <span className="ob-card-num">3</span>
                <div>
                  <h2>Wallet + slots</h2>
                  <p>One wallet reserves once, max {MAX_PER_WALLET} slots.</p>
                </div>
              </div>
              <div className="ob-form">
                <FieldLabel htmlFor="ob-wallet">TAPROOT WALLET (BC1P)</FieldLabel>
                <TextInput
                  id="ob-wallet"
                  value={wallet}
                  placeholder="bc1p…"
                  onChange={(v: string) => setWallet(v)}
                />
                <FieldLabel>SLOTS (MAX {MAX_PER_WALLET})</FieldLabel>
                <div className="ob-seg" role="group" aria-label="Quantity">
                  {Array.from({ length: MAX_PER_WALLET }, (_, i: number) => i + 1).map((n: number) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuantity(n)}
                      aria-pressed={quantity === n}
                      className={cn("ob-seg-btn", quantity === n && "ob-seg-btn--on")}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="ob-note">
                  {wallet.trim() === ""
                    ? "Your bc1p address receives the allocation later — double-check it."
                    : walletValid
                      ? "Wallet looks valid."
                      : "That doesn't look like a bc1p Taproot address."}
                </p>
                <button
                  type="submit"
                  disabled={submitting || soldOut || !handleValid || !tasksDone || !walletValid}
                  className="ob-btn"
                >
                  {soldOut
                    ? "Sold out — all 1,000 slots taken"
                    : submitting
                      ? "Reserving…"
                      : `Reserve ${quantity} slot${quantity === 1 ? "" : "s"} →`}
                </button>
              </div>
              <FormMessage
                tone={error !== "" ? "error" : ""}
                text={
                  error !== ""
                    ? error
                    : soldOut
                      ? "Sold out — all 1,000 slots are taken."
                      : !handleValid
                        ? "Step 1: enter your X handle."
                        : !tasksDone
                          ? `Step 2: ${doneCount}/3 tasks verified — finish all 3 to unlock reserving.`
                          : "All checks green — hit reserve."
                }
              />
              {!soldOut && stats !== null && stats.remaining < quantity && (
                <p className="ob-warnbox">
                  Only {stats.remaining} slot{stats.remaining === 1 ? "" : "s"} left — lower your
                  quantity to fit.
                </p>
              )}
            </section>
          </form>
        )}

        <ol className="ob-steps" aria-label="How it works">
          {[
            { h: "Handle first", p: "One X handle = one reservation. Handles can't be reused." },
            { h: "Prove you're real", p: "Follow, like + repost, comment — verified in order." },
            { h: "One wallet, once", p: `A wallet can reserve a single time, max ${MAX_PER_WALLET} slots.` },
            { h: "1,000 cap", p: "When all 1,000 slots are gone, reserving closes automatically." },
          ].map((s, i) => (
            <li key={s.h} className="ob-step">
              <span aria-hidden="true" className="ob-step-num">{i + 1}</span>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </li>
          ))}
        </ol>

        <p className="ob-foot">
          The /claim page stays hidden. Task checks are guided (open → verify), not X-API
          checked — edit links in lib/quest.ts.
        </p>
      </main>

      <Toast message={toast} />
    </Shell>
  );
}

type TaskRowProps = Readonly<{
  step: string;
  title: string;
  url: string;
  linkLabel: string;
  locked: boolean;
  lockedHint: string;
  done: boolean;
  opened: boolean;
  onOpen: () => void;
  onVerify: () => void;
}>;

function TaskRow({
  step,
  title,
  url,
  linkLabel,
  locked,
  lockedHint,
  done,
  opened,
  onOpen,
  onVerify,
}: TaskRowProps): React.JSX.Element {
  return (
    <div className={cn("ob-task", locked && "ob-task--locked")}>
      <input type="checkbox" checked={done} readOnly tabIndex={-1} aria-label={`${title} done`} />
      <div className="ob-task-body">
        <strong>
          <span className="ob-task-step">{step} · </span>
          {title} {done && <span className="ob-stamp">✓ verified</span>}
        </strong>
        {!done && locked && <span className="ob-stamp ob-stamp--idle">{lockedHint}</span>}
        {!done && !locked && !opened && (
          <span className="ob-stamp ob-stamp--idle">1) open → 2) do it → 3) verify</span>
        )}
        {!done && !locked && opened && (
          <span className="ob-stamp">Opened ✓ — do it on X, then verify</span>
        )}
        <div className="ob-task-actions">
          {locked ? (
            <span className="ob-open-btn ob-open-btn--disabled">{linkLabel} ↗</span>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpen}
              className="ob-open-btn"
            >
              {linkLabel} ↗
            </a>
          )}
          {!done && (
            <button
              type="button"
              disabled={locked || !opened}
              onClick={onVerify}
              className="ob-verify-btn"
            >
              Verify ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
