export const SITE = {
  projectName: "Oblyx",
  tokenSymbol: "NFT • 1000 SUPPLY",
  tagline: "X NFT promo — reserve your mints",
  totalSlots: 1000,
  // Manual offset added on top of the MongoDB count (e.g. offline sales).
  // The DB is now the source of truth — keep 0 unless migrating.
  alreadyReserved: 0,
  maxPerWallet: 4,
  xAccount: "OBLYX_NFT",
  xAccountUrl: "https://x.com/OBLYX_NFT",
  xPostUrl: "https://x.com/OBLYX_NFT",
} as const;

export type Reservation = {
  handle: string;
  wallet: string;
  qty: number;
  code: string;
  at: number;
  handleVerified: boolean;
  proofs?: { repostUrl?: string; commentUrl?: string };
};
