import type { Metadata } from "next";

// Hidden: noindex, not linked from home.
export const metadata: Metadata = {
  title: "Claim — Hidden",
  robots: { index: false, follow: false },
};

import ClaimBox from "./claim-box";

export default function ClaimPage() {
  return (
    <>
      <header className="nav">
        <div className="nav-in">
          <div className="badge-x">O</div>
          <div className="brand"><b>Claim Portal</b><span>Hidden • reservation only</span></div>
        </div>
      </header>
      <div className="shell">
        <section className="hero">
          <span className="kicker">RESERVATION ONLY</span>
          <h1>
            Claim <span className="out">portal</span>
          </h1>
        </section>
        <ClaimBox />
      </div>
    </>
  );
}
