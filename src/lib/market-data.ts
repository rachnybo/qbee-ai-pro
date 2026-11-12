import type { Candle } from "@/lib/scanner";
import { yahooCandidates } from "@/lib/markets";

// Server-side market data loaders (crypto: Binance, gold/forex/indices: Yahoo, fallbacks)
const BINANCE = "https://data-api.binance.vision/api/v3"; // public crypto data, no key
const YAHOO_HOSTS = ["query1", "query2"]; // Gold, Forex, Indices (Yahoo Finance)
const BYBIT = "https://api.bybit.com/v5/market/kline"; // gold fallback: XAUUSDT perpetual
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const TFS = ["5m", "15m", "1h", "4h"];
export const TF_MS: Record<string, number> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };
const YAHOO_PLAN: Record<string, { iv: string; range: string; agg: number }> = {
  "5m": { iv: "5m", range: "5d", agg: 1 },
  "15m": { iv: "15m", range: "5d", agg: 1 },
  "1h": { iv: "60m", range: "1mo", agg: 1 },
  "4h": { iv: "60m", range: "3mo", agg: 4 },
};

export type Loaded = { candles: Candle[]; note?: string };

async function binanceKlines(symbol: string, tf: string): Promise<Loaded> {
  const res = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${tf}&limit=300`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${symbol} ${res.status}`);
  const rows = (await res.json()) as (string | number)[][];
  return {
    candles: rows.map((r) => ({
      t: Number(r[0]),
      o: Number(r[1]),
      h: Number(r[2]),
      l: Number(r[3]),
      c: Number(r[4]),
      v: Number(r[5]),
    })),
  };
}

function aggregate(c: Candle[], ms: number): Candle[] {
  const out: Candle[] = [];
  for (const x of c) {
    const bucket = Math.floor(x.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === bucket) {
      last.h = Math.max(last.h, x.h);
      last.l = Math.min(last.l, x.l);
      last.c = x.c;
      last.v += x.v;
    } else {
      out.push({ t: bucket, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v });
    }
  }
  return out;
}

async function yahooKlines(symbol: string, candidates: string[], tf: string): Promise<Loaded> {
  const plan = YAHOO_PLAN[tf];
  let lastErr: unknown = new Error(`${symbol} no data`);
  for (let k = 0; k < candidates.length; k++) {
    const ysym = candidates[k];
    try {
      let j: { chart?: { result?: { timestamp?: number[]; indicators?: { quote?: Record<string, (number | null)[]>[] } }[] } } | null = null;
      let hostErr: unknown = null;
      for (const host of YAHOO_HOSTS) {
        try {
          const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?interval=${plan.iv}&range=${plan.range}&includePrePost=false`;
          const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) throw new Error(`${ysym} HTTP ${res.status}`);
          j = await res.json();
          break;
        } catch (e) {
          hostErr = e;
        }
      }
      if (!j) throw hostErr ?? new Error(`${ysym} no response`);
      const r = j?.chart?.result?.[0];
      const ts = r?.timestamp;
      const q = r?.indicators?.quote?.[0];
      if (!ts || !q) throw new Error(`${ysym} no data`);

      let candles: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        candles.push({ t: ts[i] * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
      }
      if (plan.agg > 1) candles = aggregate(candles, plan.agg * 3_600_000);
      if (candles.length < 80) throw new Error(`${ysym} too few candles`);

      const note = k > 0 ? `${symbol} uses ${ysym} (futures price, can differ from spot by a few points)` : undefined;
      return { candles: candles.slice(-300), note };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const BYBIT_TF: Record<string, string> = { "5m": "5", "15m": "15", "1h": "60", "4h": "240" };

async function bybitKlines(symbol: string, tf: string): Promise<Loaded> {
  const res = await fetch(`${BYBIT}?category=linear&symbol=${symbol}&interval=${BYBIT_TF[tf]}&limit=300`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bybit ${symbol} HTTP ${res.status}`);
  const j = await res.json();
  const list: string[][] | undefined = j?.result?.list;
  if (!list || list.length < 80) throw new Error(`Bybit ${symbol} no data`);
  const candles = list
    .map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) }))
    .reverse(); // Bybit returns newest first
  return { candles };
}

export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function load(symbol: string, tf: string): Promise<Loaded> {
  const yahoo = yahooCandidates(symbol);
  if (!yahoo) return binanceKlines(symbol, tf);
  try {
    return await yahooKlines(symbol, yahoo, tf);
  } catch (e) {
    if (symbol === "XAUUSD") {
      let bybitErr: unknown = null;
      try {
        const l = await bybitKlines("XAUUSDT", tf);
        return { ...l, note: "XAUUSD uses Bybit XAUUSDT (gold perpetual, tracks spot closely)" };
      } catch (e2) {
        bybitErr = e2;
      }
      try {
        const l = await binanceKlines("PAXGUSDT", tf);
        return { ...l, note: "XAUUSD uses Binance PAXGUSDT (gold-backed token, tracks spot within a small gap)" };
      } catch (e3) {
        throw new Error(`Yahoo: ${msg(e)} | Bybit: ${msg(bybitErr)} | Binance: ${msg(e3)}`);
      }
    }
    throw e;
  }
}

