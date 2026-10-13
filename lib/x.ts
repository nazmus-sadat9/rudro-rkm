// X helpers. Pure checks run in the browser (no keys).
// True on-chain-style proof (did THEY follow/like/repost?) needs
// backend + Login with X + X API reads — see app/api/verify/route.ts.

export function extractStatusId(url: string): string | null {
  const m = url.trim().match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/i);
  return m ? m[1] : null;
}

export function isXStatusUrl(url: string): boolean {
  return /(?:x\.com|twitter\.com)\/\w+\/status\/\d+/i.test(url.trim());
}

// Proof URL must be an X status link authored by the claimed handle,
// e.g. https://x.com/theirhandle/status/123… — prevents pasting random links.
export function validProofForHandle(proofUrl: string, handle: string): boolean {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  const m = proofUrl.trim().match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/i);
  if (!m) return false;
  return m[1].toLowerCase() === h;
}

export type HandleCheck =
  | { mode: "verified"; exists: true }
  | { mode: "verified"; exists: false }
  | { mode: "mock"; exists: null }; // no X_BEARER_TOKEN on server yet
