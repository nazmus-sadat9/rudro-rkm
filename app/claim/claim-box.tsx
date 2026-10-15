"use client";

import { useState } from "react";
import type { ReservationStatus } from "../../lib/config";
import { getMintByWallet, loadReservations, validWallet } from "../../lib/store";

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Pending review",
  accepted: "Accepted ✓",
  rejected: "Rejected",
};

export default function ClaimBox() {
  const [wallet, setWallet] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const [status, setStatus] = useState<ReservationStatus | null>(null);

  async function unlock() {
    const w = wallet.trim();
    if (!w) return;
    if (!validWallet(w)) {
      setErr("Enter a valid wallet address.");
      return;
    }
    const local = loadReservations().find((r) => r.wallet === w);
    if (local) {
      setErr("");
      setStatus(local.status ?? "pending");
      setOk(`@${local.handle} • ${local.qty} NFT${local.qty === 1 ? "" : "s"} • ${local.wallet}`);
      return;
    }
    try {
      const f = await getMintByWallet(w);
      if (!f) {
        setErr("Wallet not found. Use the wallet you reserved with.");
        return;
      }
      setErr("");
      setStatus(f.status);
      setOk(`@${f.handle} • ${f.qty} NFT${f.qty === 1 ? "" : "s"} • ${f.wallet}`);
    } catch {
      setErr("Lookup unavailable — connect and retry, or use the reserving device.");
    }
  }

  if (ok && status) {
    if (status === "rejected") {
      return (
        <section className="card" style={{ textAlign: "center" }}>
          <div className="sec-label mono">REJECTED</div>
          <h2>Not eligible</h2>
          <p className="sub">{ok}</p>
          <p className="hint" style={{ marginTop: 10 }}>
            This reservation was rejected — its slot was freed, so you can reserve again on the home page.
          </p>
        </section>
      );
    }
    return (
      <section className="card tint-gold" style={{ textAlign: "center" }}>
        <div className="sec-label mono">{STATUS_LABEL[status].toUpperCase()}</div>
        <h2>{status === "accepted" ? "Eligible" : "Reserved"}</h2>
        <p className="sub">{ok}</p>
        <div className="btnrow"><button className="btn btn-p" disabled>Claim is not live yet</button></div>
        <p className="hint" style={{ marginTop: 10 }}>
          {status === "accepted"
            ? "Wire this button to your drop when live."
            : "Your reservation is pending review — check back soon."}
        </p>
      </section>
    );
  }

  return (
    <section className="card tint-iris">
      <div className="sec-label mono">HIDDEN CLAIM</div>
      <h2>Enter your wallet</h2>
      <p className="sub">Only wallets that reserved on the home page can continue.</p>
      <label className="lbl" htmlFor="w">Wallet address</label>
      <input id="w" placeholder="0x… EVM address" value={wallet}
        onChange={(e) => setWallet(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      {err && <p className="err">{err}</p>}
      <div className="btnrow"><button className="btn btn-p" onClick={unlock}>Unlock claim →</button></div>
    </section>
  );
}
