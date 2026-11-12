export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Signal = {
  id: string;
  symbol: string;
  tf: string;
  direction: "BUY" | "SELL";
  price: number;
  entry: number;
  stopLoss: number;
  takeProfit: number[];
  rr: number;
  score: number;
  status: "IN ZONE" | "WAIT PULLBACK";
  tags: string[];
  time: number;
};

const K = 3; // swing strength (candles each side)

export function atr(c: Candle[], n = 14) {
  const start = Math.max(1, c.length - n);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < c.length; i++) {
    sum += Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

function ema(values: number[], n: number) {
  const k = 2 / (n + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

// Mirror prices so one "long" detector can also find shorts
function mirror(c: Candle[]): Candle[] {
  return c.map((x) => ({ t: x.t, o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v }));
}

export function swingHighs(c: Candle[]) {
  const r: number[] = [];
  for (let i = K; i < c.length - K; i++) {
    let ok = true;
    for (let j = 1; j <= K; j++) {
      if (c[i].h < c[i - j].h || c[i].h <= c[i + j].h) {
        ok = false;
        break;
      }
    }
    if (ok) r.push(i);
  }
  return r;
}

export function swingLows(c: Candle[]) {
  const r: number[] = [];
  for (let i = K; i < c.length - K; i++) {
    let ok = true;
    for (let j = 1; j <= K; j++) {
      if (c[i].l > c[i - j].l || c[i].l >= c[i + j].l) {
        ok = false;
        break;
      }
    }
    if (ok) r.push(i);
  }
  return r;
}

type Hit = {
  sweepIdx: number;
  mssIdx: number;
  sweepLow: number;
  impulseHigh: number;
  fvg: { lo: number; hi: number } | null;
};

// Bullish ICT setup: sell-side liquidity sweep -> market structure shift -> FVG / OTE entry
function detectLong(c: Candle[]): Hit | null {
  const n = c.length;
  const sh = swingHighs(c);
  const sl = swingLows(c);
  const from = Math.max(K + 2, n - 20);

  for (let j = n - 1; j >= from; j--) {
    const s = [...sl].reverse().find((i) => i < j - K);
    if (s === undefined) continue;
    const level = c[s].l;
    if (!(c[j].l < level && c[j].c > level)) continue; // wick takes the low, closes back above

    const s2 = [...sh].reverse().find((i) => i < j);
    if (s2 === undefined) continue;
    const mssLevel = c[s2].h;
    let mssIdx = -1;
    for (let i = j + 1; i < n; i++) {
      if (c[i].c > mssLevel) {
        mssIdx = i;
        break;
      }
    }
    if (mssIdx < 0) continue;

    let sweepLow = Infinity;
    let impulseHigh = -Infinity;
    for (let i = j; i < n; i++) {
      sweepLow = Math.min(sweepLow, c[i].l);
      impulseHigh = Math.max(impulseHigh, c[i].h);
    }

    let fvg: { lo: number; hi: number } | null = null;
    for (let i = Math.max(j + 1, 2); i < n; i++) {
      if (c[i].l > c[i - 2].h) {
        const lo = c[i - 2].h;
        let filled = false;
        for (let k = i + 1; k < n; k++) {
          if (c[k].l < lo) {
            filled = true;
            break;
          }
        }
        if (!filled) fvg = { lo, hi: c[i].l };
      }
    }
    return { sweepIdx: j, mssIdx, sweepLow, impulseHigh, fvg };
  }
  return null;
}

export type Detailed = { signal: Signal; sweepTime: number; mssTime: number };

export function analyze(symbol: string, tf: string, candles: Candle[]): Signal[] {
  return analyzeDetailed(symbol, tf, candles).map((d) => d.signal);
}

export function analyzeDetailed(symbol: string, tf: string, candles: Candle[]): Detailed[] {
  if (candles.length < 80) return [];
  const closed = candles.slice(0, -1); // ignore the candle still forming
  const last = candles[candles.length - 1];
  const price = last.c;
  const a = atr(closed);
  if (!a) return [];

  const trend = ema(closed.map((x) => x.c), 50);
  const hour = new Date(last.t).getUTCHours();
  const killzone = (hour >= 7 && hour < 11) || (hour >= 12 && hour < 16);
  const out: Detailed[] = [];

  for (const dir of ["BUY", "SELL"] as const) {
    const sgn = dir === "BUY" ? 1 : -1;
    const hit = detectLong(dir === "BUY" ? closed : mirror(closed));
    if (!hit) continue;

    const p = price * sgn;
    const lo = hit.sweepLow;
    const hi = hit.impulseHigh;
    const tags = ["Liquidity sweep", "MSS"];
    let entry: number;
    let score = 60;

    if (hit.fvg && hit.fvg.lo > lo && hit.fvg.hi < hi) {
      entry = (hit.fvg.lo + hit.fvg.hi) / 2;
      tags.push("FVG");
      score += 15;
    } else {
      entry = hi - 0.705 * (hi - lo);
      tags.push("OTE 70.5%");
      score += 5;
    }

    const sl = lo - 0.1 * a;
    const risk = entry - sl;
    if (risk <= 0 || risk > 6 * a || p <= sl) continue; // invalid or already stopped out

    const tp1 = Math.max(hi, entry + 1.5 * risk);
    const tp2 = entry + 3 * risk;

    if (dir === "BUY" ? price > trend : price < trend) {
      score += 10;
      tags.push("With trend");
    }
    if (killzone) {
      score += 10;
      tags.push("Killzone");
    }

    out.push({
      sweepTime: closed[hit.sweepIdx].t,
      mssTime: closed[hit.mssIdx].t,
      signal: {
      id: `${symbol}-${tf}-${dir}`,
      symbol,
      tf,
      direction: dir,
      price,
      entry: entry * sgn,
      stopLoss: sl * sgn,
      takeProfit: [tp1 * sgn, tp2 * sgn],
      rr: (tp1 - entry) / risk,
      score: Math.min(score, 100),
      status: p <= entry + 0.25 * a ? "IN ZONE" : "WAIT PULLBACK",
      tags,
      time: last.t,
      },
    });
  }
  return out;
}
