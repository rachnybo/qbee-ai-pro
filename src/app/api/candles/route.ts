import { NextRequest, NextResponse } from "next/server";
import { load, msg, TFS } from "@/lib/market-data";
import { normalizePair } from "@/lib/markets";

export async function GET(req: NextRequest) {
  const tf = req.nextUrl.searchParams.get("tf") ?? "15m";
  const symbol = normalizePair(req.nextUrl.searchParams.get("symbol") ?? "");
  if (!TFS.includes(tf)) return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) return NextResponse.json({ error: "Invalid pair" }, { status: 400 });

  try {
    const { candles, note } = await load(symbol, tf);
    return NextResponse.json({ symbol, tf, candles, note: note ?? null, at: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: `Could not load ${symbol}: ${msg(e).slice(0, 200)}` }, { status: 502 });
  }
}
