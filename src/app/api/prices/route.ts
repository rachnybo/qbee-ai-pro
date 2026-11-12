import { NextRequest, NextResponse } from "next/server";

const BASE = "https://data-api.binance.vision/api/v3";
const DEFAULT = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "PAXGUSDT", "DOGEUSDT", "LINKUSDT"];

type Ticker = { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string };

export async function GET(req: NextRequest) {
  const custom = req.nextUrl.searchParams.get("symbols");
  const symbols = custom ? custom.split(",").map((s) => s.trim().toUpperCase()).slice(0, 20) : DEFAULT;
  try {
    const res = await fetch(`${BASE}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: `Upstream ${res.status}`, ticks: [] }, { status: 502 });
    const rows = (await res.json()) as Ticker[];
    const ticks = rows.map((r) => ({
      symbol: r.symbol,
      price: Number(r.lastPrice),
      change: Number(r.priceChangePercent),
      volume: Number(r.quoteVolume),
    }));
    return NextResponse.json({ ticks, at: Date.now() });
  } catch {
    return NextResponse.json({ error: "Market data unavailable", ticks: [] }, { status: 502 });
  }
}
