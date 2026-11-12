import { NextRequest, NextResponse } from "next/server";
import { analyze, type Signal } from "@/lib/scanner";
import { load, msg, TF_MS, TFS } from "@/lib/market-data";
import { canonical } from "@/lib/markets";

const DEFAULT_SYMBOLS = [
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "NAS100",
  "US30", "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
];
const VALID = /^[A-Z0-9]{3,20}$/;
export async function GET(req: NextRequest) {
  const tf = req.nextUrl.searchParams.get("tf") ?? "15m";
  if (!TFS.includes(tf)) return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });

  const raw = req.nextUrl.searchParams.get("symbols");
  const symbols = raw
    ? Array.from(
        new Set(
          raw
            .split(",")
            .map((x) => canonical(x.trim().toUpperCase()))
            .filter((x) => VALID.test(x))
        )
      ).slice(0, 30)
    : DEFAULT_SYMBOLS;
  if (symbols.length === 0) return NextResponse.json({ error: "No valid symbols" }, { status: 400 });

  const results = await Promise.allSettled(symbols.map(async (symbol) => ({ symbol, ...(await load(symbol, tf)) })));

  const signals: Signal[] = [];
  const failed: string[] = [];
  const errors: Record<string, string> = {};
  const closed: string[] = [];
  const notes: string[] = [];
  const now = Date.now();

  results.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      failed.push(symbols[i]);
      errors[symbols[i]] = msg(r.reason).slice(0, 160);
      return;
    }
    const { symbol, candles, note } = r.value;
    if (note) notes.push(note);
    const lastT = candles[candles.length - 1].t;
    if (now - lastT > 3 * TF_MS[tf]) {
      closed.push(symbol); // market closed (weekend / holiday): data is stale
      return;
    }
    signals.push(...analyze(symbol, tf, candles));
  });
  signals.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    tf,
    scanned: symbols.length - failed.length,
    failed,
    errors,
    closed,
    notes,
    signals,
    at: Date.now(),
  });
}
