import { NextResponse } from "next/server";

// If SITE_PASSWORD is not set, the gate is disabled (local development).
export function authorized(authHeader: string | null): boolean {
  const pass = process.env.SITE_PASSWORD;
  if (!pass) return true;
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  try {
    const decoded = atob(authHeader.slice(6));
    const i = decoded.indexOf(":");
    return decoded.slice(i + 1) === pass; // username is ignored
  } catch {
    return false;
  }
}

// Second line of defence for endpoints that spend money.
export function gate(req: Request) {
  if (authorized(req.headers.get("authorization"))) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
