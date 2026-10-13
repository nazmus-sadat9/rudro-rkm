"use client";

import { useState } from "react";
import { getMintByCode, loadReservations } from "@/lib/store";
import {
  FieldLabel,
  FormMessage,
  Shell,
  SiteHeader,
  TextInput,
} from "@/components/ui";

export default function ClaimPage(): React.JSX.Element {
  const [code, setCode] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [ok, setOk] = useState<string | null>(null);
  const [checking, setChecking] = useState<boolean>(false);

  async function unlock(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c === "") {
      setErr("Enter your reservation code.");
      return;
    }
    const local = loadReservations().find((r) => r.code === c);
    if (local !== undefined) {
      setErr("");
      setOk(`@${local.handle} · ${local.qty} NFT${local.qty === 1 ? "" : "s"} · ${local.wallet}`);
      return;
    }
    setChecking(true);
    setErr("");
    try {
      const f = await getMintByCode(c);
      if (f === null) {
        setErr("Code not found. Use the device you reserved with, or check the code.");
        return;
      }
      setOk(`@${f.handle} · ${f.qty} NFT${f.qty === 1 ? "" : "s"} · ${f.wallet}`);
    } catch {
      setErr("Lookup unavailable — connect and retry, or use the reserving device.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Shell>
      <SiteHeader
        tag="CLAIM"
        badge="HIDDEN"
        badgeTone="warn"
        links={[{ href: "/", label: "← Home" }]}
      />
      <main>
        <section className="ob-hero ob-hero--tight">
          <span className="ob-kicker">
            <span aria-hidden="true" className="ob-kicker-bar" />
            RESERVATION ONLY
          </span>
          <h1 className="ob-title">
            Claim <em>portal.</em>
          </h1>
          <p className="ob-lead">
            Only wallets that reserved on the home page can continue. This page is unlisted.
          </p>
        </section>

        {ok !== null ? (
          <section className="ob-card" aria-label="Claim eligibility">
            <div className="ob-card-head">
              <span className="ob-card-num">✓</span>
              <div>
                <h2>Eligible</h2>
                <p>{ok}</p>
              </div>
            </div>
            <div className="ob-form">
              <button type="button" disabled className="ob-btn">
                Claim is not live yet
              </button>
            </div>
            <p className="ob-msg">Wire this button to your drop when live.</p>
          </section>
        ) : (
          <section className="ob-card" aria-label="Unlock claim">
            <div className="ob-card-head">
              <span className="ob-card-num">O</span>
              <div>
                <h2>Enter reservation code</h2>
                <p>Only wallets that reserved on the home page can continue.</p>
              </div>
            </div>
            <form onSubmit={(e: React.FormEvent<HTMLFormElement>) => void unlock(e)} className="ob-form">
              <FieldLabel htmlFor="ob-claim-code">RESERVATION CODE</FieldLabel>
              <TextInput
                id="ob-claim-code"
                value={code}
                placeholder="XC-XXXXXX"
                onChange={(v: string) => {
                  setCode(v.toUpperCase());
                  setErr("");
                }}
              />
              <button type="submit" disabled={checking} className="ob-btn">
                {checking ? "Checking…" : "Unlock claim →"}
              </button>
            </form>
            <FormMessage tone={err !== "" ? "error" : ""} text={err} />
          </section>
        )}
      </main>
    </Shell>
  );
}
