import type { Metadata } from "next";

// Hidden: noindex, not linked from home.
export const metadata: Metadata = {
  title: "Claim — Hidden",
  robots: { index: false, follow: false },
};

import ClaimBox from "./claim-box";
import Link from "next/link";
import styles from "./coming-soon.module.css";

export default function ClaimPage() {
  return (
    <>
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.logo}>X</div>
          <div>
            <p className={styles.headerTitle}>CLAIM PORTAL</p>
          </div>
        </header>

        <section className={styles.content}>

          <h1 className={styles.title}>
            <span>COMING</span>
            <span className={styles.titlePill}>SOON...</span>
          </h1>

          <div className={styles.card}>
            <p className={styles.kicker}>RESERVATION OPEN TILL</p>
            <h2 className={styles.cardTitle}>EVERY SLOT IS TAKEN</h2>
            <p className={styles.cardText}>
              The next phase opens when all reservation slots are filled.
            </p>
            <Link href="/" className={styles.button}>
              BACK TO HOME →
            </Link>
          </div>
        </section>
      </main>


      { /*
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

     */}
    </>
  );
}
