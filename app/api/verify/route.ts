import { NextResponse } from "next/server";

// POST /api/verify { handle }
// - Format-checks the handle.
// - If X_BEARER_TOKEN is set, checks the account really exists via X API v2.
// - Otherwise returns mode:"mock" (frontend allows with a notice).
//
// NOTE: proving "this user follows / liked / reposted" needs Login with X
// (OAuth 2.0 user context) + paid X API reads. That comes next once you
// create an X Developer App. This route is the seam for it.
export async function POST(req: Request) {
  const { handle } = (await req.json().catch(() => ({}))) as { handle?: string };
  const h = (handle || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) {
    return NextResponse.json({ mode: "verified", exists: false, reason: "bad-format" });
  }
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json({ mode: "mock", exists: null });
  }
  try {
    const r = await fetch(`https://api.x.com/2/users/by/username/${h}?user.fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 404) return NextResponse.json({ mode: "verified", exists: false });
    if (!r.ok) return NextResponse.json({ mode: "mock", exists: null, reason: "api-error" });
    await r.json();
    return NextResponse.json({ mode: "verified", exists: true });
  } catch {
    return NextResponse.json({ mode: "mock", exists: null, reason: "network" });
  }
}
