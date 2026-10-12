"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOrder, saveOrderAsync, type MintOrder, type OrderStatus } from "@/lib/orders";
import {
  FieldLabel,
  FormMessage,
  Shell,
  SiteHeader,
  TextInput,
  Toast,
  cn,
} from "@/components/ui";

const SUPPLY_LIMIT: number = 1000;
const START_TOTAL: number = 642;
const SATS_PER_NFT: number = 18400;
const BASE_SATS: number = 8000;
const RESERVATION_MS: number = 60 * 60 * 1000;

const DEMO_BC1P: string = "bc1p" + "p".repeat(58);
const PAYMENT_RECIPIENT: string = "0xbeC228a6e7CF36bf9FB23a8D509172b9aEa19D0E";

type Tone = "" | "error" | "success";
interface Flash {
  text: string;
  tone: Tone;
}
const EMPTY_FLASH: Flash = { text: "", tone: "" };

function randomToken(): string {
  const bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  bytes.forEach((b: number) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function randomHex(n: number): string {
  const bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b: number) => b.toString(16).padStart(2, "0")).join("");
}

function isValidBc1p(v: string): boolean {
  return /^bc1p[023456789ac-hj-np-z]{58}$/.test(v);
}

function satsToBtc(sats: number): string {
  return (sats / 1e8).toFixed(8);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "expired";
  const s: number = Math.floor(ms / 1000);
  const h: number = Math.floor(s / 3600);
  const m: number = Math.floor((s % 3600) / 60);
  const sec: number = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ClaimPage(): React.JSX.Element {
  const [mintTotal, setMintTotal] = useState<number>(0);
  const [address, setAddress] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(2);
  const [recovery, setRecovery] = useState<string>("");
  const [message, setMessage] = useState<Flash>(EMPTY_FLASH);
  const [order, setOrder] = useState<MintOrder | null>(null);
  const [txid, setTxid] = useState<string>("");
  const [paymentMsg, setPaymentMsg] = useState<Flash>(EMPTY_FLASH);
  const [toast, setToast] = useState<string>("");
  const [now, setNow] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const showToast = useCallback((msg: string): void => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    let raf = 0;
    const t0: number = performance.now();
    const dur = 1400;
    const tick = (t: number): void => {
      const p: number = Math.min(1, (t - t0) / dur);
      const eased: number = 1 - Math.pow(1 - p, 3);
      setMintTotal(Math.round(START_TOTAL * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (order === null || order.status !== "awaiting_payment") return;
    const id: number = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [order]);

  const remaining: number = useMemo(
    () => Math.max(0, SUPPLY_LIMIT - mintTotal - (order ? order.quantity : 0)),
    [mintTotal, order]
  );
  const pct: number = useMemo(
    () => Math.min(100, (mintTotal / SUPPLY_LIMIT) * 100),
    [mintTotal]
  );
  const expired: boolean = order ? order.expiresAt <= now : false;

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

  const persist = useCallback(
    async (o: MintOrder): Promise<boolean> => {
      setBusy(true);
      try {
        await saveOrderAsync(o);
        setOrder(o);
        return true;
      } catch {
        setMessage({
          text: "Could not reach the database. Check your connection and try again.",
          tone: "error",
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const scrollToId = (id: string): void => {
    requestAnimationFrame(() => {
      document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const reserve = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const addr: string = address.trim();
    if (!isValidBc1p(addr)) {
      setMessage({
        text: "That doesn't look like a bc1p Taproot address. Try the demo autofill below.",
        tone: "error",
      });
      return;
    }
    const rec: string = recovery.trim();
    if (rec !== "" && !/^[A-Za-z0-9_-]{32,128}$/.test(rec)) {
      setMessage({ text: "That recovery code doesn't look valid.", tone: "error" });
      return;
    }
    if (rec !== "") {
      // Returning order? Look it up in the database first.
      setBusy(true);
      getOrder(rec)
        .then((found: MintOrder | null) => {
          if (found !== null) {
            setOrder(found);
            setTxid(found.txid);
            setPaymentMsg(EMPTY_FLASH);
            setMessage({ text: "Order restored — see payment details below.", tone: "success" });
            scrollToId("#qm-payment");
          } else {
            setMessage({ text: "No order found for that recovery code.", tone: "error" });
          }
        })
        .catch(() => {
          setMessage({
            text: "Could not reach the database. Check your connection and try again.",
            tone: "error",
          });
        })
        .finally(() => {
          setBusy(false);
        });
      return;
    }
    const amountSats: number = BASE_SATS + SATS_PER_NFT * quantity;
    const t: number = Date.now();
    const fresh: MintOrder = {
      token: randomToken(),
      address: addr,
      quantity,
      amountSats,
      recipient: PAYMENT_RECIPIENT,
      createdAt: t,
      expiresAt: t + RESERVATION_MS,
      status: "awaiting_payment",
      txid: "",
    };
    void persist(fresh).then((ok: boolean) => {
      if (!ok) return;
      setTxid("");
      setPaymentMsg(EMPTY_FLASH);
      setMessage({ text: "Reserved for one hour. Send payment, then submit the hash.", tone: "success" });
      setNow(Date.now());
      scrollToId("#qm-payment");
    });
  };

  const submitTxid = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (order === null) return;
    const v: string = txid.trim().toLowerCase();
    if (!/^(0x)?[a-f0-9]{64}$/.test(v)) {
      setPaymentMsg({ text: "Enter the transaction hash of your payment.", tone: "error" });
      return;
    }
    const next: MintOrder = { ...order, txid: v, status: "verified" satisfies OrderStatus };
    void persist(next).then((ok: boolean) => {
      if (!ok) return;
      setPaymentMsg({
        text: "Hash recorded. Your claim is queued for review and delivery.",
        tone: "success",
      });
      showToast("Payment hash recorded");
    });
  };

  const startAnother = (): void => {
    setOrder(null);
    setTxid("");
    setQuantity(1);
    setRecovery("");
    setPaymentMsg(EMPTY_FLASH);
    setMessage(EMPTY_FLASH);
    scrollToId("#qm-order");
  };

  return (
    <Shell>
      <SiteHeader
        tag="CLAIM"
        badge="OPEN"
        badgeTone="ok"
        links={[
          { href: "#qm-how", label: "How it works" },
          { href: "/admin", label: "Admin" },
        ]}
      />

      <main>
        <section className="ob-hero">
          <span className="ob-kicker">
            <span aria-hidden="true" className="ob-kicker-bar" />
            <span>PUBLIC CLAIM · 1,000 PIECES</span>
          </span>
          <h1 className="ob-title">
            Claim the <em>quiet.</em>
          </h1>
          <p className="ob-lead">
            A silent-edition drop of 1,000 pieces. The art itself is free — you only cover
            the inscription and delivery fee. Drop in a Taproot address you own, lock up
            to four pieces to it, send one manual payment, and paste the hash back here.
          </p>
          <div className="ob-chips">
            {[
              { k: "Supply", v: "1,000" },
              { k: "Price", v: "Free + fee" },
              { k: "Limit", v: "4 / address" },
              { k: "Payment", v: "Manual" },
            ].map((chip) => (
              <span key={chip.k} className="ob-chip">
                {chip.k} <b>{chip.v}</b>
              </span>
            ))}
          </div>
        </section>

        <section aria-label="Claim progress" className="ob-panel">
          <div className="ob-panel-head">
            <h2>Collection progress</h2>
            <span className="ob-panel-count">
              <b>{mintTotal.toLocaleString("en-US")}</b> / 1,000 claimed
            </span>
          </div>
          <div
            className="ob-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={1000}
            aria-valuenow={mintTotal}
          >
            <span className="ob-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="ob-stats">
            <div className="ob-stat">
              <small>REMAINING</small>
              <strong>{remaining.toLocaleString("en-US")}</strong>
            </div>
            <div className="ob-stat">
              <small>FEE PER PIECE</small>
              <strong>≈ {satsToBtc(SATS_PER_NFT)} BTC</strong>
            </div>
            <div className="ob-stat ob-stat--wide">
              <small>RESERVATION</small>
              <strong>1 hour hold</strong>
            </div>
          </div>
        </section>

        <ol id="qm-how" className="ob-steps">
          {[
            { n: "01", h: "Lock your pieces", p: "Enter a bc1p address, pick 1–4 pieces, and reserve them for one hour." },
            { n: "02", h: "Pay + paste the hash", p: "Send the exact amount to the payment address, then submit the transaction hash." },
          ].map((s) => (
            <li key={s.n} className="ob-step">
              <span aria-hidden="true" className="ob-step-num">
                {s.n}
              </span>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </li>
          ))}
        </ol>

        <section id="qm-order" aria-labelledby="qm-order-title" className="ob-card">
          <div className="ob-card-head">
            <span className="ob-card-num">01</span>
            <div>
              <h2 id="qm-order-title">Your delivery address</h2>
              <p>Bitcoin mainnet Taproot address starting with bc1p.</p>
            </div>
          </div>
          <form onSubmit={reserve} className="ob-form">
            <FieldLabel htmlFor="qm-address">DELIVERY ADDRESS</FieldLabel>
            <TextInput
              id="qm-address"
              value={address}
              placeholder="bc1p…"
              onChange={setAddress}
            />
            <FieldLabel>HOW MANY PIECES?</FieldLabel>
            <div className="ob-seg" role="group" aria-label="Quantity">
              {[1, 2, 3, 4].map((n: number) => (
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
            <FieldLabel htmlFor="qm-recovery">RECOVERY CODE (OPTIONAL)</FieldLabel>
            <TextInput
              id="qm-recovery"
              value={recovery}
              placeholder="Paste a code from an earlier order"
              onChange={setRecovery}
            />
            <p className="ob-note">Four pieces max per address, including anything claimed before.</p>
            <button type="submit" disabled={busy} className="ob-btn">
              {busy ? "Reserving…" : "Reserve my pieces →"}
            </button>
          </form>
          <div>
            <FormMessage tone={message.tone} text={message.text} />
          </div>
          <button type="button" onClick={() => setAddress(DEMO_BC1P)} className="ob-link-btn">
            → Fill a demo address
          </button>
        </section>

        {order !== null && (
          <section
            id="qm-payment"
            aria-labelledby="qm-payment-title"
            className="ob-card ob-scroll-anchor"
          >
            <div className="ob-card-head">
              <span className="ob-card-num">02</span>
              <div>
                <h2 id="qm-payment-title">Manual payment</h2>
                <p>One transfer, exact amount, then paste the hash.</p>
              </div>
            </div>

            <dl className="ob-facts">
              {[
                { k: "DELIVER TO", v: order.address, hl: false },
                { k: "PIECES", v: `${order.quantity} × free`, hl: false },
                {
                  k: "TOTAL FEE",
                  v: `${order.amountSats.toLocaleString("en-US")} sats · ${satsToBtc(order.amountSats)} BTC`,
                  hl: true,
                },
              ].map((row) => (
                <div key={row.k} className="ob-fact-row">
                  <dt>{row.k}</dt>
                  <dd className={cn(row.hl && "ob-hl")}>{row.v}</dd>
                </div>
              ))}
            </dl>

            <div>
              <span className="ob-reserve-pill">
                {expired
                  ? "⚠ reservation expired — start a new one"
                  : `◷ reserved · ${formatCountdown(order.expiresAt - now)} left`}
              </span>
            </div>

            <div className="ob-pay">
              <h3>Send exactly {satsToBtc(order.amountSats)} BTC to</h3>
              <p>Double-check the address — payments to the wrong address can&apos;t be matched.</p>
              <div className="ob-copy">
                <code>{order.recipient}</code>
                <button type="button" onClick={() => void copy(order.recipient, "Payment address")}>
                  Copy
                </button>
              </div>
            </div>

            <div className="ob-codebox">
              <span>YOUR PRIVATE RECOVERY CODE — SAVE IT</span>
              <code>{order.token}</code>
            </div>

            <form onSubmit={submitTxid} className="ob-form">
              <FieldLabel htmlFor="qm-txid">TRANSACTION HASH</FieldLabel>
              <TextInput
                id="qm-txid"
                value={txid}
                placeholder="0x…"
                onChange={setTxid}
              />
              <button type="submit" disabled={busy} className="ob-btn ob-btn--ghost">
                {busy ? "Saving…" : "Submit payment hash"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setTxid(`0x${randomHex(32).toLowerCase()}`)}
              className="ob-link-btn"
            >
              → Generate a demo hash
            </button>
            {paymentMsg.text !== "" && (
              <div>
                <FormMessage tone={paymentMsg.tone} text={paymentMsg.text} />
              </div>
            )}
            <div className="ob-warnbox">
              Already paid? Sit tight — your pieces arrive after review. Never pay twice for
              the same order.
            </div>
          </section>
        )}

        {order !== null && (
          <button type="button" onClick={startAnother} className="ob-btn ob-btn--ghost">
            Start a new claim
          </button>
        )}

        <p className="ob-foot">
          Demo build — no real chain, no real delivery. Orders are stored in the
          shared database. The claim stays open until all 1,000 pieces are
          gone; unpaid reservations release after one hour.
        </p>
      </main>

      <Toast message={toast} />
    </Shell>
  );
}
