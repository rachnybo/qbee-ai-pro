import { NextResponse } from "next/server";

// If a futures contract cannot be reached, try the matching spot market.
const SPOT_ALT: Record<string, string> = { XAUUSDT: "PAXGUSDT" };

type Src = { label: string; symbol: string; url: string; futures: boolean };

async function fetchKlines(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
  }
  if (!Array.isArray(json)) throw new Error(json.msg || `HTTP ${res.status}`);
  return json as any[][];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "PAXGUSDT").toUpperCase();
  const interval = searchParams.get("interval") || "5m";
  const market = searchParams.get("market") || "spot";
  const limit = searchParams.get("limit") || "500";

  const q = (sym: string) => `symbol=${sym}&interval=${interval}&limit=${limit}`;
  const spotSym = market === "spot" ? symbol : SPOT_ALT[symbol] || symbol;

  const sources: Src[] = [];
  if (market !== "spot") {
    sources.push({ label: "Binance Futures", symbol, url: `https://fapi.binance.com/fapi/v1/klines?${q(symbol)}`, futures: true });
  }
  sources.push({ label: "Binance Vision", symbol: spotSym, url: `https://data-api.binance.vision/api/v3/klines?${q(spotSym)}`, futures: false });
  sources.push({ label: "Binance Spot", symbol: spotSym, url: `https://api.binance.com/api/v3/klines?${q(spotSym)}`, futures: false });

  const errs: string[] = [];
  const tasks = sources.map(async (s) => {
    try {
      return { s, rows: await fetchKlines(s.url) };
    } catch (e: any) {
      errs.push(`${s.label}: ${e.message}`);
      throw e;
    }
  });

  let win: { s: Src; rows: any[][] };
  try {
    win = await Promise.any(tasks);
  } catch {
    return NextResponse.json(
      { error: `ទាញទិន្នន័យពី Binance មិនបាន។ ${errs.join(" | ")}។ ប្រហែល network/ISP រារាំង សូមសាកល្បង VPN ឬប្តូរ DNS (1.1.1.1)។` },
      { status: 502 }
    );
  }

  const { s, rows } = win;
  const bars = rows.map((k: any[]) => {
    const vol = +k[5];
    const buy = +k[9]; // taker buy base volume = buyers hitting the ask
    const sell = vol - buy; // sellers hitting the bid
    return {
      time: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4],
      vol, buy, sell, delta: buy - sell,
    };
  });
  const fellBack = s.symbol !== symbol || (market !== "spot" && !s.futures);
  return NextResponse.json({
    symbol: s.symbol,
    interval,
    source: s.label,
    note: fellBack ? `ទិន្នន័យមកពី ${s.label} (${s.symbol}) ព្រោះ Futures ទាញមិនបាន។ តម្លៃអាចខុសបន្តិចពី XAUUSD ពិត។` : "",
    bars,
  });
}
