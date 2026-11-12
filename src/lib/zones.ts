import { analyzeDetailed, atr, swingHighs, swingLows, type Candle, type Signal } from "@/lib/scanner";

export type ZoneKind = "FVG" | "OB" | "KZ" | "PD" | "LQ" | "RR";

export type Zone = {
  id: string;
  kind: ZoneKind;
  t1: number; // ms, always a real candle time
  t2: number | "end"; // ms, or "end" = right edge of the chart
  p1: number | null; // null = full chart height
  p2: number | null;
  label: string;
  fill: string;
  border: string;
  line?: boolean; // thin dashed line (p1 === p2)
};

export type Mark = {
  time: number; // ms
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
};

export type Point = { time: number; value: number };

export type View = {
  signal: Signal | null;
  zones: Zone[];
  marks: Mark[];
  ema50: Point[];
  ema200: Point[];
  summary: {
    bias: string;
    pd: "Premium" | "Discount";
    price: number;
    eq: number;
    fvgCount: number;
    obCount: number;
    levels: { label: string; price: number }[];
  };
};

const GREEN_F = "rgba(16,185,129,0.14)";
const GREEN_B = "rgba(16,185,129,0.65)";
const RED_F = "rgba(244,63,94,0.14)";
const RED_B = "rgba(244,63,94,0.65)";
const BLUE_F = "rgba(59,130,246,0.16)";
const BLUE_B = "rgba(96,165,250,0.75)";
const PURPLE_F = "rgba(168,85,247,0.16)";
const PURPLE_B = "rgba(192,132,252,0.75)";

function emaSeries(c: Candle[], n: number): Point[] {
  const k = 2 / (n + 1);
  const out: Point[] = [];
  let e = c[0].c;
  for (let i = 0; i < c.length; i++) {
    e = i === 0 ? c[0].c : c[i].c * k + e * (1 - k);
    if (i >= n - 1) out.push({ time: c[i].t, value: e });
  }
  return out;
}

export function buildView(symbol: string, tf: string, candles: Candle[]): View {
  const n = candles.length;
  const closed = candles.slice(0, -1); // the last candle is still forming
  const a = atr(closed) || 0;
  const start = Math.max(3, closed.length - 160);
  const zones: Zone[] = [];

  // ---- Fair value gaps (unfilled, shrunk by partial fills) ----
  const fvgs: Zone[] = [];
  for (let i = Math.max(2, start); i < closed.length; i++) {
    const c0 = closed[i - 2];
    const c2 = closed[i];
    if (c2.l > c0.h && c2.l - c0.h >= 0.15 * a) {
      const lo = c0.h;
      let top = c2.l;
      let filled = false;
      for (let k = i + 1; k < n; k++) {
        if (candles[k].l <= lo) {
          filled = true;
          break;
        }
        top = Math.min(top, candles[k].l);
      }
      if (!filled && top > lo) {
        fvgs.push({ id: `fvg-${i}`, kind: "FVG", t1: c0.t, t2: "end", p1: lo, p2: top, label: "FVG", fill: GREEN_F, border: GREEN_B });
      }
    } else if (c0.l > c2.h && c0.l - c2.h >= 0.15 * a) {
      const hi = c0.l;
      let bottom = c2.h;
      let filled = false;
      for (let k = i + 1; k < n; k++) {
        if (candles[k].h >= hi) {
          filled = true;
          break;
        }
        bottom = Math.max(bottom, candles[k].h);
      }
      if (!filled && hi > bottom) {
        fvgs.push({ id: `fvg-${i}`, kind: "FVG", t1: c0.t, t2: "end", p1: bottom, p2: hi, label: "FVG", fill: RED_F, border: RED_B });
      }
    }
  }
  const fvgShown = fvgs.slice(-6);
  zones.push(...fvgShown);

  // ---- Order blocks: last opposite candle before a strong displacement ----
  const obs: Zone[] = [];
  for (let i = Math.max(1, start); i < closed.length; i++) {
    const x = closed[i];
    if (Math.abs(x.c - x.o) < 1.6 * a) continue;
    const bull = x.c > x.o;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const y = closed[j];
      if (bull ? y.c < y.o : y.c > y.o) {
        let broken = false;
        for (let k = i + 1; k < n; k++) {
          if (bull ? candles[k].c < y.l : candles[k].c > y.h) {
            broken = true;
            break;
          }
        }
        if (!broken && !obs.some((o) => o.id === `ob-${j}`)) {
          obs.push({
            id: `ob-${j}`,
            kind: "OB",
            t1: y.t,
            t2: "end",
            p1: y.l,
            p2: y.h,
            label: bull ? "Bull OB" : "Bear OB",
            fill: bull ? BLUE_F : PURPLE_F,
            border: bull ? BLUE_B : PURPLE_B,
          });
        }
        break;
      }
    }
  }
  const obShown = obs.slice(-4);
  zones.push(...obShown);

  // ---- Liquidity: unswept swing highs / lows (BSL, SSL, equal highs / lows) ----
  const price = candles[n - 1].c;
  const sweptHigh = (i: number) => {
    for (let k = i + 1; k < n; k++) if (candles[k].h >= closed[i].h) return true;
    return false;
  };
  const sweptLow = (i: number) => {
    for (let k = i + 1; k < n; k++) if (candles[k].l <= closed[i].l) return true;
    return false;
  };
  const shs = swingHighs(closed);
  const sls = swingLows(closed);
  const bsl = shs.filter((i) => i >= start - 20 && !sweptHigh(i)).slice(-4);
  const ssl = sls.filter((i) => i >= start - 20 && !sweptLow(i)).slice(-4);
  const levels: { label: string; price: number }[] = [];
  for (const i of bsl) {
    const p = closed[i].h;
    const equal = bsl.some((j) => j !== i && Math.abs(closed[j].h - p) <= 0.15 * a);
    const label = equal ? "EQH" : "BSL";
    levels.push({ label, price: p });
    zones.push({ id: `bsl-${i}`, kind: "LQ", t1: closed[i].t, t2: "end", p1: p, p2: p, label, fill: "transparent", border: "rgba(250,204,21,0.8)", line: true });
  }
  for (const i of ssl) {
    const p = closed[i].l;
    const equal = ssl.some((j) => j !== i && Math.abs(closed[j].l - p) <= 0.15 * a);
    const label = equal ? "EQL" : "SSL";
    levels.push({ label, price: p });
    zones.push({ id: `ssl-${i}`, kind: "LQ", t1: closed[i].t, t2: "end", p1: p, p2: p, label, fill: "transparent", border: "rgba(56,189,248,0.8)", line: true });
  }

  // ---- Premium / discount of the last 80 candles ----
  const seg = closed.slice(-Math.min(80, closed.length));
  const hi = Math.max(...seg.map((x) => x.h));
  const lo = Math.min(...seg.map((x) => x.l));
  const eq = (hi + lo) / 2;
  zones.push({ id: "pd-prem", kind: "PD", t1: seg[0].t, t2: "end", p1: eq, p2: hi, label: "Premium", fill: "rgba(244,63,94,0.05)", border: "rgba(244,63,94,0.30)" });
  zones.push({ id: "pd-disc", kind: "PD", t1: seg[0].t, t2: "end", p1: lo, p2: eq, label: "Discount", fill: "rgba(16,185,129,0.05)", border: "rgba(16,185,129,0.30)" });
  zones.push({ id: "pd-eq", kind: "PD", t1: seg[0].t, t2: "end", p1: eq, p2: eq, label: "EQ 50%", fill: "transparent", border: "rgba(255,255,255,0.45)", line: true });

  // ---- Killzones (London 07-10 UTC, New York 12-15 UTC; approximate) ----
  if (tf !== "4h") {
    let cur: { name: string; t1: number; t2: number } | null = null;
    const flush = () => {
      if (!cur) return;
      const london = cur.name === "London KZ";
      zones.push({
        id: `kz-${cur.t1}`,
        kind: "KZ",
        t1: cur.t1,
        t2: cur.t2,
        p1: null,
        p2: null,
        label: cur.name,
        fill: london ? "rgba(251,191,36,0.06)" : "rgba(56,189,248,0.06)",
        border: london ? "rgba(251,191,36,0.55)" : "rgba(56,189,248,0.55)",
      });
      cur = null;
    };
    for (const x of closed) {
      const h = new Date(x.t).getUTCHours();
      const name = h >= 7 && h < 10 ? "London KZ" : h >= 12 && h < 15 ? "NY KZ" : "";
      if (cur && cur.name !== name) flush();
      if (name) {
        if (cur) cur.t2 = x.t;
        else cur = { name, t1: x.t, t2: x.t };
      }
    }
    flush();
  }

  // ---- Signal: entry / stop / targets as a position box + markers ----
  const marks: Mark[] = [];
  const best = analyzeDetailed(symbol, tf, candles).sort((x, y) => y.signal.score - x.signal.score)[0];
  let signal: Signal | null = null;
  if (best) {
    signal = best.signal;
    const buy = signal.direction === "BUY";
    const lastClosed = closed[closed.length - 1];
    const risk = Math.abs(signal.entry - signal.stopLoss);
    const tp1 = signal.takeProfit[0];
    zones.push({
      id: "rr-tp",
      kind: "RR",
      t1: lastClosed.t,
      t2: "end",
      p1: signal.entry,
      p2: tp1,
      label: `TP1 ${(Math.abs(tp1 - signal.entry) / (risk || 1)).toFixed(1)}R`,
      fill: "rgba(16,185,129,0.18)",
      border: "rgba(16,185,129,0.7)",
    });
    zones.push({
      id: "rr-sl",
      kind: "RR",
      t1: lastClosed.t,
      t2: "end",
      p1: signal.entry,
      p2: signal.stopLoss,
      label: "SL",
      fill: "rgba(244,63,94,0.18)",
      border: "rgba(244,63,94,0.7)",
    });
    marks.push({ time: best.sweepTime, position: buy ? "belowBar" : "aboveBar", color: "#facc15", shape: "circle", text: "Sweep" });
    marks.push({ time: best.mssTime, position: buy ? "aboveBar" : "belowBar", color: "#38bdf8", shape: buy ? "arrowUp" : "arrowDown", text: "MSS" });
    marks.sort((x, y) => x.time - y.time);
  }

  // ---- Structure bias ----
  let bias = "Ranging";
  if (shs.length >= 2 && sls.length >= 2) {
    const hh = closed[shs[shs.length - 1]].h > closed[shs[shs.length - 2]].h;
    const hl = closed[sls[sls.length - 1]].l > closed[sls[sls.length - 2]].l;
    if (hh && hl) bias = "Bullish (HH + HL)";
    else if (!hh && !hl) bias = "Bearish (LH + LL)";
  }

  return {
    signal,
    zones,
    marks,
    ema50: emaSeries(candles, 50),
    ema200: emaSeries(candles, 200),
    summary: {
      bias,
      pd: price >= eq ? "Premium" : "Discount",
      price,
      eq,
      fvgCount: fvgShown.length,
      obCount: obShown.length,
      levels: levels.sort((x, y) => y.price - x.price),
    },
  };
}
