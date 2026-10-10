"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveOrder, type MintOrder, type OrderStatus } from "@/lib/orders";
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

  const persist = useCallback((o: MintOrder): void => {
    setOrder(o);
    try {
      saveOrder(o);
    } catch {
      /* local store unavailable — order still works for this session */
    }
  }, []);

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
    if (recovery.trim() !== "" && !/^[A-Za-z0-9_-]{32,128}$/.test(recovery.trim())) {
      setMessage({ text: "That recovery code doesn't look valid.", tone: "error" });
      return;
    }
    if (recovery.trim() !== "" && order !== null && recovery.trim() === order.token) {
      setMessage({ text: "Order restored — see payment details below.", tone: "success" });
      scrollToId("#qm-payment");
      return;
    }
    const amountSats: number = BASE_SATS + SATS_PER_NFT * quantity;
    const t: number = Date.now();
    persist({
      token: randomToken(),
      address: addr,
      quantity,
      amountSats,
      recipient: PAYMENT_RECIPIENT,
      createdAt: t,
      expiresAt: t + RESERVATION_MS,
      status: "awaiting_payment",
      txid: "",
    });
    setTxid("");
    setPaymentMsg(EMPTY_FLASH);
    setMessage({ text: "Reserved for one hour. Send payment, then submit the hash.", tone: "success" });
    setNow(Date.now());
    scrollToId("#qm-payment");
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
    persist(next);
    setPaymentMsg({
      text: "Hash recorded. Your claim is queued for review and delivery.",
      tone: "success",
    });
    showToast("Payment hash recorded");
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

      <main className="min-w-0">
        <section className="max-w-[720px] min-w-0 pt-8 text-left sm:pt-11">
          <span className="inline-flex max-w-full flex-wrap items-center gap-2 font-mono text-[11px] font-medium tracking-[2px] text-brand">
            <span aria-hidden="true" className="h-[2px] w-[22px] flex-none rounded-sm bg-brand" />
            <span className="break-words">PUBLIC CLAIM · 1,000 PIECES</span>
          </span>
          <h1 className="mt-4 mb-3.5 font-display text-[34px] leading-[1.05] font-semibold tracking-tight break-words sm:text-5xl lg:text-[60px]">
            Claim the <em className="text-brand not-italic">quiet.</em>
          </h1>
          <p className="max-w-[600px] text-sm leading-[1.75] text-mut sm:text-[15px]">
            A silent-edition drop of 1,000 pieces. The art itself is free — you only cover
            the inscription and delivery fee. Drop in a Taproot address you own, lock up
            to four pieces to it, send one manual payment, and paste the hash back here.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { k: "Supply", v: "1,000" },
              { k: "Price", v: "Free + fee" },
              { k: "Limit", v: "4 / address" },
              { k: "Payment", v: "Manual" },
            ].map((chip) => (
              <span
                key={chip.k}
                className="rounded-full border border-line bg-card px-3 py-[7px] font-mono text-[11px] break-words text-mut"
              >
                {chip.k} <b className="font-medium text-ink">{chip.v}</b>
              </span>
            ))}
          </div>
        </section>

        <section
          aria-label="Claim progress"
          className="mt-6 min-w-0 rounded-[18px] border border-line bg-card p-4 shadow-[0_18px_44px_rgba(0,0,0,0.35)] sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <h2 className="font-display text-[15px] font-semibold tracking-tight">
              Collection progress
            </h2>
            <span className="font-mono text-xs break-words text-mut">
              <b className="font-display text-2xl font-semibold tracking-tight text-ink">
                {mintTotal.toLocaleString("en-US")}
              </b>{" "}
              / 1,000 claimed
            </span>
          </div>
          <div
            className="mt-4 h-[10px] overflow-hidden rounded-full border border-line bg-deep"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={1000}
            aria-valuenow={mintTotal}
          >
            <span
              className="block h-full rounded-[inherit] bg-brand transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-2 gap-2.5 lg:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-line bg-deep/60 px-3.5 py-3">
              <small className="block font-mono text-[9px] tracking-[1.4px] text-faint">
                REMAINING
              </small>
              <strong className="mt-[7px] block font-display text-base font-semibold tracking-tight break-words text-white sm:text-[19px]">
                {remaining.toLocaleString("en-US")}
              </strong>
            </div>
            <div className="min-w-0 rounded-xl border border-line bg-deep/60 px-3.5 py-3">
              <small className="block font-mono text-[9px] tracking-[1.4px] text-faint">
                FEE PER PIECE
              </small>
              <strong className="mt-[7px] block font-display text-base font-semibold tracking-tight break-words text-white sm:text-[19px]">
                ≈ {satsToBtc(SATS_PER_NFT)} BTC
              </strong>
            </div>
            <div className="col-span-2 min-w-0 rounded-xl border border-line bg-deep/60 px-3.5 py-3 lg:col-span-1">
              <small className="block font-mono text-[9px] tracking-[1.4px] text-faint">
                RESERVATION
              </small>
              <strong className="mt-[7px] block font-display text-base font-semibold tracking-tight break-words text-white sm:text-[19px]">
                1 hour hold
              </strong>
            </div>
          </div>
        </section>

        <ol id="qm-how" className="mt-3.5 grid list-none gap-2.5 p-0 sm:grid-cols-2">
          {[
            { n: "01", h: "Lock your pieces", p: "Enter a bc1p address, pick 1–4 pieces, and reserve them for one hour." },
            { n: "02", h: "Pay + paste the hash", p: "Send the exact amount to the payment address, then submit the transaction hash." },
          ].map((s) => (
            <li
              key={s.n}
              className="relative min-w-0 overflow-hidden rounded-[14px] border border-line bg-card p-[18px]"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-3 font-display text-[54px] font-bold text-brand/10 select-none"
              >
                {s.n}
              </span>
              <h3 className="relative mb-1.5 text-sm font-semibold">{s.h}</h3>
              <p className="relative text-[12.5px] leading-[1.65] text-mut">{s.p}</p>
            </li>
          ))}
        </ol>

        <section
          id="qm-order"
          aria-labelledby="qm-order-title"
          className="mt-3.5 min-w-0 overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_18px_44px_rgba(0,0,0,0.35)]"
        >
          <div className="flex min-w-0 items-center gap-3 border-b border-line bg-card2 p-4 sm:px-[22px] sm:py-[19px]">
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-brand-deep font-mono text-[13px] font-bold text-white">
              01
            </span>
            <div className="min-w-0">
              <h2 id="qm-order-title" className="font-display text-base font-semibold break-words">
                Your delivery address
              </h2>
              <p className="mt-[3px] text-xs break-words text-mut">
                Bitcoin mainnet Taproot address starting with bc1p.
              </p>
            </div>
          </div>
          <form onSubmit={reserve} className="grid min-w-0 gap-2 p-4 sm:px-[22px] sm:pt-5 sm:pb-2">
            <FieldLabel htmlFor="qm-address">DELIVERY ADDRESS</FieldLabel>
            <TextInput
              id="qm-address"
              value={address}
              placeholder="bc1p…"
              onChange={setAddress}
            />
            <FieldLabel>HOW MANY PIECES?</FieldLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Quantity">
              {[1, 2, 3, 4].map((n: number) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuantity(n)}
                  aria-pressed={quantity === n}
                  className={cn(
                    "min-h-[50px] rounded-[10px] border font-display text-sm font-semibold transition",
                    quantity === n
                      ? "border-brand bg-brand/10 text-brand-ink ring-[3px] ring-brand/15"
                      : "border-line bg-deep text-mut hover:border-brand/60 hover:text-ink"
                  )}
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
            <p className="text-[11.5px] leading-[1.6] break-words text-faint">
              Four pieces max per address, including anything claimed before.
            </p>
            <button
              type="submit"
              className="mt-3 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-deep px-[22px] text-sm font-bold text-white transition hover:-translate-y-px hover:bg-brand disabled:cursor-not-allowed disabled:opacity-45"
            >
              Reserve my pieces →
            </button>
          </form>
          <div className="pb-1">
            <FormMessage tone={message.tone} text={message.text} />
          </div>
          <button
            type="button"
            onClick={() => setAddress(DEMO_BC1P)}
            className="px-4 pb-5 text-left font-mono text-xs break-words text-brand hover:underline sm:px-[22px]"
          >
            → Fill a demo address
          </button>
        </section>

        {order !== null && (
          <section
            id="qm-payment"
            aria-labelledby="qm-payment-title"
            className="mt-3.5 min-w-0 scroll-mt-4 overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_18px_44px_rgba(0,0,0,0.35)]"
          >
            <div className="flex min-w-0 items-center gap-3 border-b border-line bg-card2 p-4 sm:px-[22px] sm:py-[19px]">
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-brand-deep font-mono text-[13px] font-bold text-white">
                02
              </span>
              <div className="min-w-0">
                <h2 id="qm-payment-title" className="font-display text-base font-semibold break-words">
                  Manual payment
                </h2>
                <p className="mt-[3px] text-xs break-words text-mut">
                  One transfer, exact amount, then paste the hash.
                </p>
              </div>
            </div>

            <dl className="mx-3 mt-[18px] min-w-0 overflow-hidden rounded-xl border border-line bg-deep sm:mx-[22px]">
              {[
                { k: "DELIVER TO", v: order.address, hl: false },
                { k: "PIECES", v: `${order.quantity} × free`, hl: false },
                {
                  k: "TOTAL FEE",
                  v: `${order.amountSats.toLocaleString("en-US")} sats · ${satsToBtc(order.amountSats)} BTC`,
                  hl: true,
                },
              ].map((row) => (
                <div
                  key={row.k}
                  className="flex min-w-0 flex-col gap-1 border-b border-line px-[15px] py-[13px] text-xs last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3.5"
                >
                  <dt className="flex-none font-mono text-[9px] tracking-[1.4px] text-faint">
                    {row.k}
                  </dt>
                  <dd
                    className={cn(
                      "min-w-0 font-mono text-xs break-all sm:text-right",
                      row.hl ? "text-brand-ink" : "text-ink"
                    )}
                  >
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="px-3 sm:px-[22px]">
              <span className="mt-3 inline-flex max-w-full flex-none flex-wrap items-center gap-[7px] rounded-full border border-warn/35 bg-warn/10 px-3 py-[7px] font-mono text-[11px] break-words text-warn">
                {expired
                  ? "⚠ reservation expired — start a new one"
                  : `◷ reserved · ${formatCountdown(order.expiresAt - now)} left`}
              </span>
            </div>

            <div className="mx-3 mt-3.5 min-w-0 rounded-xl border border-line bg-brand/10 p-4 sm:mx-[22px]">
              <h3 className="text-[13.5px] font-semibold break-words">
                Send exactly {satsToBtc(order.amountSats)} BTC to
              </h3>
              <p className="mt-1.5 text-xs leading-[1.6] break-words text-mut">
                Double-check the address — payments to the wrong address can&apos;t be matched.
              </p>
              <div className="mt-2.5 flex min-w-0 flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 rounded-lg border border-line bg-deep px-3 py-[11px] font-mono text-xs break-all text-brand-ink">
                  {order.recipient}
                </code>
                <button
                  type="button"
                  onClick={() => void copy(order.recipient, "Payment address")}
                  className="h-11 flex-none rounded-lg border border-line bg-card2 px-[15px] text-xs font-semibold text-ink transition hover:border-brand hover:text-brand-ink sm:w-auto"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="mx-3 mt-3.5 min-w-0 rounded-xl border border-line bg-deep px-[15px] py-3.5 sm:mx-[22px]">
              <span className="font-mono text-[9px] tracking-[1.4px] break-words text-faint">
                YOUR PRIVATE RECOVERY CODE — SAVE IT
              </span>
              <code className="mt-[7px] block min-w-0 font-mono text-xs break-all text-ink">
                {order.token}
              </code>
            </div>

            <form onSubmit={submitTxid} className="grid min-w-0 gap-2 p-4 sm:px-[22px] sm:pt-5 sm:pb-2">
              <FieldLabel htmlFor="qm-txid">TRANSACTION HASH</FieldLabel>
              <TextInput
                id="qm-txid"
                value={txid}
                placeholder="0x…"
                onChange={setTxid}
              />
              <button
                type="submit"
                className="mt-3 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-transparent px-[22px] text-sm font-semibold text-brand-ink transition hover:border-brand hover:bg-brand/10"
              >
                Submit payment hash
              </button>
            </form>
            <button
              type="button"
              onClick={() => setTxid(`0x${randomHex(32).toLowerCase()}`)}
              className="px-4 pb-1 text-left font-mono text-xs break-words text-brand hover:underline sm:px-[22px]"
            >
              → Generate a demo hash
            </button>
            {paymentMsg.text !== "" && (
              <div className="pt-2 pb-1">
                <FormMessage tone={paymentMsg.tone} text={paymentMsg.text} />
              </div>
            )}
            <div className="mx-3 mt-3.5 mb-[22px] min-w-0 rounded-[10px] border border-bad/30 bg-bad/10 px-3.5 py-3 text-[11.5px] leading-[1.65] break-words text-bad sm:mx-[22px]">
              Already paid? Sit tight — your pieces arrive after review. Never pay twice for
              the same order.
            </div>
          </section>
        )}

        {order !== null && (
          <button
            type="button"
            onClick={startAnother}
            className="mt-3.5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-transparent px-[22px] text-sm font-semibold text-brand-ink transition hover:border-brand hover:bg-brand/10"
          >
            Start a new claim
          </button>
        )}

        <p className="mx-1.5 mt-5 text-[11.5px] leading-[1.75] break-words text-faint">
          Demo build — no real chain, no real delivery. Orders are kept in this browser
          until you connect a database (see the Admin page). The claim stays open until
          all 1,000 pieces are gone; unpaid reservations release after one hour.
        </p>
      </main>

      <Toast message={toast} />
    </Shell>
  );
}
