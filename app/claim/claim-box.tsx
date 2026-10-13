"use client";

import { useState } from "react";
import { getMintByCode, loadReservations } from "../../lib/store";

export default function ClaimBox() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState<string | null>(null);

  async function unlock() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const local = loadReservations().find((r) => r.code === c);
    if (local) {
      setErr("");
      setOk(`@${local.handle} • ${local.qty} NFT${local.qty === 1 ? "" : "s"} • ${local.wallet}`);
      return;
    }
    try {
      const f = await getMintByCode(c);
      if (!f) {
        setErr("Code not found. Use the device you reserved with, or check the code.");
        return;
      }
      setErr("");
      setOk(`@${f.handle} • ${f.qty} NFT${f.qty === 1 ? "" : "s"} • ${f.wallet}`);
    } catch {
      setErr("Lookup unavailable — connect and retry, or use the reserving device.");
    }
  }

  if (ok) {
    return (
      <section className="card tint-gold" style={{ textAlign: "center" }}>
        <div className="sec-label mono">ELIGIBLE</div>
        <h2>Eligible</h2>
        <p className="sub">{ok}</p>
        <div className="btnrow"><button className="btn btn-p" disabled>Claim is not live yet</button></div>
        <p className="hint" style={{ marginTop: 10 }}>
          Wire this button to your drop when live.
        </p>
      </section>
    );
  }

  return (
    <section className="card tint-iris">
      <div className="sec-label mono">HIDDEN CLAIM</div>
      <h2>Enter reservation code</h2>
      <p className="sub">Only wallets that reserved on the home page can continue.</p>
      <label className="lbl" htmlFor="c">Reservation code</label>
      <input id="c" placeholder="XC-XXXXXX" value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" spellCheck={false} />
      {err && <p className="err">{err}</p>}
      <div className="btnrow"><button className="btn btn-p" onClick={unlock}>Unlock claim →</button></div>
    </section>
  );
}
