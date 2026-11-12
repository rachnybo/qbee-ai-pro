"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as LW from "lightweight-charts";

type Bar = {
  time: number; open: number; high: number; low: number; close: number;
  vol: number; buy: number; sell: number; delta: number;
};
type Status = "PENDING" | "OPEN" | "WIN" | "LOSS" | "EXPIRED" | "CANCELLED";
type Order = {
  id: number; i: number; time: number; dir: "BUY" | "SELL"; kind: string;
  zoneLo: number; zoneHi: number; entry: number; sl: number; tp1: number; tp2: number;
  status: Status; fillTime?: number; endTime?: number; dp: number; volx: number;
};

const SYMBOLS = [
  { id: "PAXGUSDT", label: "Gold · PAXG (Spot)", market: "spot" },
  { id: "BTCUSDT", label: "Bitcoin · BTCUSDT (Spot)", market: "spot" },
  { id: "ETHUSDT", label: "Ethereum · ETHUSDT (Spot)", market: "spot" },
];
const TFS = [
  { id: "1m", label: "M1" }, { id: "3m", label: "M3" }, { id: "5m", label: "M5" },
  { id: "15m", label: "M15" }, { id: "1h", label: "H1" }, { id: "4h", label: "H4" },
];

const KIND_TEXT: Record<string, string> = {
  "absorb-buy": "Absorption: អ្នកលក់វាយខ្លាំង (Delta ដក) តែតម្លៃមិនធ្លាក់ទៀត នៅ low ថ្មី = អ្នកទិញស្រូប",
  "absorb-sell": "Absorption: អ្នកទិញវាយខ្លាំង (Delta ឡើង) តែតម្លៃមិនឡើងទៀត នៅ high ថ្មី = អ្នកលក់ស្រូប",
  "imb-buy": "Imbalance: អ្នកទិញគ្រប់គ្រង (Delta ឡើងខ្លាំង) ហើយបំបែកឡើង Zone ទិញត្រូវបានទុកជាចំណុចត្រឡប់មកវិញ",
  "imb-sell": "Imbalance: អ្នកលក់គ្រប់គ្រង (Delta ដកខ្លាំង) ហើយបំបែកចុះ Zone លក់ត្រូវបានទុកជាចំណុចត្រឡប់មកវិញ",
};

const STATUS_TEXT: Record<Status, string> = {
  PENDING: "រង់ចាំតម្លៃប៉ះ", OPEN: "បានចូលហើយ", WIN: "WIN", LOSS: "LOSS", EXPIRED: "ផុតកំណត់", CANCELLED: "បោះបង់",
};
const STATUS_CLS: Record<Status, string> = {
  PENDING: "bg-amber-500/15 text-amber-400",
  OPEN: "bg-sky-500/15 text-sky-400",
  WIN: "bg-emerald-500/15 text-emerald-400",
  LOSS: "bg-rose-500/15 text-rose-400",
  EXPIRED: "bg-zinc-500/15 text-zinc-400",
  CANCELLED: "bg-zinc-500/15 text-zinc-400",
};

function atr(bars: Bar[], p = 14) {
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const pc = i > 0 ? bars[i - 1].close : bars[i].close;
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc));
    out.push(i === 0 ? tr : i < p ? (out[i - 1] * i + tr) / (i + 1) : (out[i - 1] * (p - 1) + tr) / p);
  }
  return out;
}

function simulate(bars: Bar[], s: Order, exp: number) {
  const n = bars.length;
  const end = Math.min(n - 1, s.i + exp);
  for (let k = s.i + 1; k <= end; k++) {
    const x = bars[k];
    if (s.status === "PENDING") {
      const touched = s.dir === "BUY" ? x.low <= s.entry : x.high >= s.entry;
      if (touched) {
        s.status = "OPEN"; s.fillTime = x.time;
        const stopped = s.dir === "BUY" ? x.low <= s.sl : x.high >= s.sl;
        if (stopped) { s.status = "LOSS"; s.endTime = x.time; return; }
        continue;
      }
      const broken = s.dir === "BUY" ? x.close < s.zoneLo : x.close > s.zoneHi;
      if (broken) { s.status = "CANCELLED"; s.endTime = x.time; return; }
    } else if (s.status === "OPEN") {
      if (s.dir === "BUY") {
        if (x.low <= s.sl) { s.status = "LOSS"; s.endTime = x.time; return; }
        if (x.high >= s.tp1) { s.status = "WIN"; s.endTime = x.time; return; }
      } else {
        if (x.high >= s.sl) { s.status = "LOSS"; s.endTime = x.time; return; }
        if (x.low <= s.tp1) { s.status = "WIN"; s.endTime = x.time; return; }
      }
    }
  }
  if (s.status === "PENDING" && s.i + exp <= n - 1) { s.status = "EXPIRED"; s.endTime = bars[s.i + exp].time; }
}

type Opt = { mult: number; imb: number; rr: number; buf: number; entry: "mid" | "edge"; cvdFilter: boolean };

function compute(bars: Bar[], o: Opt) {
  const n = bars.length;
  const a = atr(bars, 14);
  const cvd: number[] = [];
  let run = 0;
  for (const b of bars) { run += b.delta; cvd.push(run); }
  const orders: Order[] = [];
  const EXP = 40;
  let id = 0, lastBuy = -99, lastSell = -99;

  for (let t = 21; t < n; t++) {
    const b = bars[t];
    const range = b.high - b.low;
    if (range <= 0 || b.vol <= 0) continue;
    let sv = 0;
    for (let j = t - 20; j < t; j++) sv += bars[j].vol;
    const avg = sv / 20;
    if (avg <= 0) continue;
    const volx = b.vol / avg;
    if (volx < o.mult) continue;

    const dp = b.delta / b.vol;
    const pos = (b.close - b.low) / range;
    let lo10 = Infinity, hi10 = -Infinity;
    for (let j = t - 10; j < t; j++) { lo10 = Math.min(lo10, bars[j].low); hi10 = Math.max(hi10, bars[j].high); }
    const cvdUp = cvd[t] > cvd[t - 20];
    const cvdDn = cvd[t] < cvd[t - 20];
    const prev = bars[t - 1];

    let dir: "BUY" | "SELL" | null = null;
    let kind = "";
    let zLo = 0, zHi = 0;

    if (dp <= -o.imb && pos >= 0.55 && b.low <= lo10) {
      dir = "BUY"; kind = "absorb-buy";
      zLo = b.low; zHi = Math.min(b.high, Math.max(Math.min(b.open, b.close), b.low + 0.3 * a[t]));
    } else if (dp >= o.imb && pos <= 0.45 && b.high >= hi10) {
      dir = "SELL"; kind = "absorb-sell";
      zHi = b.high; zLo = Math.max(b.low, Math.min(Math.max(b.open, b.close), b.high - 0.3 * a[t]));
    } else if (dp >= o.imb && b.close > b.open && range >= a[t] && (!o.cvdFilter || cvdUp)) {
      dir = "BUY"; kind = "imb-buy";
      if (prev.close < prev.open) { zLo = prev.low; zHi = prev.high; } else { zLo = b.low; zHi = b.low + 0.5 * range; }
    } else if (dp <= -o.imb && b.close < b.open && range >= a[t] && (!o.cvdFilter || cvdDn)) {
      dir = "SELL"; kind = "imb-sell";
      if (prev.close > prev.open) { zLo = prev.low; zHi = prev.high; } else { zHi = b.high; zLo = b.high - 0.5 * range; }
    }
    if (!dir) continue;

    if (zHi - zLo > 2 * a[t]) { if (dir === "BUY") zLo = zHi - 2 * a[t]; else zHi = zLo + 2 * a[t]; }
    if (zHi <= zLo) continue;
    if (dir === "BUY") { if (t - lastBuy < 5) continue; lastBuy = t; }
    else { if (t - lastSell < 5) continue; lastSell = t; }

    const entry = o.entry === "mid" ? (zLo + zHi) / 2 : dir === "BUY" ? zHi : zLo;
    const sl = dir === "BUY" ? zLo - o.buf * a[t] : zHi + o.buf * a[t];
    const risk = Math.abs(entry - sl);
    if (risk <= 0) continue;
    const sg = dir === "BUY" ? 1 : -1;
    const ord: Order = {
      id: id++, i: t, time: b.time, dir, kind, zoneLo: zLo, zoneHi: zHi, entry, sl,
      tp1: entry + sg * risk * o.rr, tp2: entry + sg * risk * o.rr * 1.5,
      status: "PENDING", dp, volx,
    };
    simulate(bars, ord, EXP);
    orders.push(ord);
  }
  return { orders, cvd };
}

// Footprint-style ladder: buy/sell volume per price level over the last W candles
function profile(bars: Bar[], W = 60, rows = 24) {
  const sl = bars.slice(-W);
  if (!sl.length) return null;
  const min = Math.min(...sl.map((b) => b.low));
  const max = Math.max(...sl.map((b) => b.high));
  const step = (max - min) / rows || 1;
  const buy = new Array(rows).fill(0);
  const sell = new Array(rows).fill(0);
  for (const b of sl) {
    const r = b.high - b.low;
    const lo = Math.min(rows - 1, Math.max(0, Math.floor((b.low - min) / step)));
    const hi = Math.min(rows - 1, Math.floor((b.high - min) / step));
    if (r <= 0) { buy[lo] += b.buy; sell[lo] += b.sell; continue; }
    for (let k = lo; k <= hi; k++) {
      const bl = min + k * step, bh = bl + step;
      const f = Math.max(0, Math.min(b.high, bh) - Math.max(b.low, bl)) / r;
      buy[k] += b.buy * f; sell[k] += b.sell * f;
    }
  }
  const list = buy.map((bv, k) => ({
    price: min + (k + 0.5) * step, buy: bv, sell: sell[k], total: bv + sell[k], delta: bv - sell[k],
  }));
  let poc = 0;
  list.forEach((r, k) => { if (r.total > list[poc].total) poc = k; });
  const total = list.reduce((s, r) => s + r.total, 0);
  let lo = poc, hi = poc, acc = list[poc].total;
  while (acc < total * 0.7 && (lo > 0 || hi < rows - 1)) {
    const up = hi < rows - 1 ? list[hi + 1].total : -1;
    const dn = lo > 0 ? list[lo - 1].total : -1;
    if (up >= dn) { hi++; acc += list[hi].total; } else { lo--; acc += list[lo].total; }
  }
  const maxSide = Math.max(...list.map((r) => Math.max(r.buy, r.sell)), 1);
  const avgTotal = total / rows;
  return { list, poc, vah: list[hi].price + step / 2, val: list[lo].price - step / 2, maxSide, avgTotal };
}

const fmtTime = (t: number) =>
  new Date(t * 1000).toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok", hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
const fp = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(2) : n.toFixed(4));
const fv = (n: number) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "K" : Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(2));

export default function OrderFlowPage() {
  const [symIdx, setSymIdx] = useState(0);
  const [tf, setTf] = useState("5m");
  const [mult, setMult] = useState(1.5);
  const [imb, setImb] = useState(30);
  const [rr, setRr] = useState(2);
  const [buf, setBuf] = useState(0.3);
  const [entry, setEntry] = useState<"mid" | "edge">("mid");
  const [cvdFilter, setCvdFilter] = useState(true);
  const [auto, setAuto] = useState(false);
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sym = SYMBOLS[symIdx];
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleRef = useRef<any>(null);
  const deltaRef = useRef<any>(null);
  const mkRef = useRef<any>(null);
  const linesRef = useRef<any[]>([]);
  const fitRef = useRef("");

  const closed = useMemo(() => bars.slice(0, -1), [bars]);
  const calc = useMemo(
    () => (closed.length > 60 ? compute(closed, { mult, imb: imb / 100, rr, buf, entry, cvdFilter }) : null),
    [closed, mult, imb, rr, buf, entry, cvdFilter]
  );
  const orders = calc?.orders ?? [];
  const active = [...orders].reverse().find((o) => o.status === "PENDING" || o.status === "OPEN") ?? orders[orders.length - 1];
  const prof = useMemo(() => profile(closed), [closed]);

  const wins = orders.filter((o) => o.status === "WIN").length;
  const losses = orders.filter((o) => o.status === "LOSS").length;
  const openN = orders.filter((o) => o.status === "OPEN").length;
  const missed = orders.filter((o) => o.status === "EXPIRED" || o.status === "CANCELLED").length;
  const filled = wins + losses + openN;
  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
  const netR = +(wins * rr - losses).toFixed(2);

  const lastBar = closed[closed.length - 1];
  const last20 = closed.slice(-20);
  const buyPct = last20.length ? Math.round((last20.reduce((s, b) => s + b.buy, 0) / Math.max(1e-9, last20.reduce((s, b) => s + b.vol, 0))) * 100) : 0;
  const cvdNow = calc ? calc.cvd[calc.cvd.length - 1] : 0;
  const cvdPrev = calc ? calc.cvd[Math.max(0, calc.cvd.length - 21)] : 0;
  const cvdTrend = cvdNow - cvdPrev;

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/orderflow-data?symbol=${sym.id}&interval=${tf}&market=${sym.market}&limit=500`);
      const raw = await res.text();
      let json: any;
      try { json = JSON.parse(raw); } catch { throw new Error(`Server ${res.status}: ${raw.slice(0, 200)}`); }
      if (!res.ok) throw new Error(json.error || "Request failed");
      setBars(json.bars); if (json.note) setError("ℹ️ " + json.note);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [symIdx, tf]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [auto, symIdx, tf]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const A: any = LW;
    const chart: any = A.createChart(el, {
      autoSize: true,
      layout: { textColor: "#a1a1aa" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)", scaleMargins: { top: 0.06, bottom: 0.24 } },
      timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
    });
    const mk = (kind: string, opts: any) =>
      typeof chart[`add${kind}Series`] === "function" ? chart[`add${kind}Series`](opts) : chart.addSeries(A[`${kind}Series`], opts);
    const candle = mk("Candlestick", {
      upColor: "#10b981", downColor: "#f43f5e", borderVisible: false,
      wickUpColor: "#10b981", wickDownColor: "#f43f5e",
    });
    const delta = mk("Histogram", {
      priceScaleId: "delta", priceLineVisible: false, lastValueVisible: false,
      priceFormat: { type: "volume" },
    });
    try { chart.priceScale("delta").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } }); } catch {}
    if (typeof candle.setMarkers !== "function") mkRef.current = A.createSeriesMarkers(candle, []);
    chartRef.current = chart; candleRef.current = candle; deltaRef.current = delta;
    return () => { chart.remove(); chartRef.current = null; candleRef.current = null; deltaRef.current = null; mkRef.current = null; linesRef.current = []; };
  }, []);

  useEffect(() => {
    const c = candleRef.current;
    if (!c || !bars.length) return;
    c.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    deltaRef.current?.setData(
      bars.map((b) => ({ time: b.time, value: b.delta, color: b.delta >= 0 ? "rgba(16,185,129,0.65)" : "rgba(244,63,94,0.65)" }))
    );

    const mks = orders.map((o) => ({
      time: o.time,
      position: o.dir === "BUY" ? "belowBar" : "aboveBar",
      color: o.dir === "BUY" ? "#10b981" : "#f43f5e",
      shape: o.dir === "BUY" ? "arrowUp" : "arrowDown",
      text: o.dir === "BUY" ? "BUY ZONE" : "SELL ZONE",
    }));
    if (typeof c.setMarkers === "function") c.setMarkers(mks);
    else mkRef.current?.setMarkers(mks);

    linesRef.current.forEach((l) => { try { c.removePriceLine(l); } catch {} });
    linesRef.current = [];
    const add = (price: number, color: string, title: string, style = 2) =>
      linesRef.current.push(c.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    if (prof) add(prof.list[prof.poc].price, "#fbbf24", "POC", 1);
    if (active && (active.status === "PENDING" || active.status === "OPEN")) {
      const col = active.dir === "BUY" ? "#10b981" : "#f43f5e";
      add(active.zoneHi, col, active.dir === "BUY" ? "BUY ZONE ↑" : "SELL ZONE ↑", 0);
      add(active.zoneLo, col, active.dir === "BUY" ? "BUY ZONE ↓" : "SELL ZONE ↓", 0);
      add(active.entry, "#e4e4e7", "ENTRY");
      add(active.sl, "#f43f5e", "SL");
      add(active.tp1, "#10b981", "TP1");
      add(active.tp2, "#34d399", "TP2");
    }
    const key = sym.id + tf;
    if (fitRef.current !== key) {
      fitRef.current = key;
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 140), to: bars.length + 8 });
    }
  }, [bars, orders, active, prof, sym.id, tf]);

  const pill = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`;
  const sel = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const lbl = "mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground";
  const box = "rounded-lg border border-border bg-background/40 p-2";
  const cap = "text-[10px] uppercase text-muted-foreground";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Order Flow <span className="text-primary">Indicator</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            តាមដានដានជើងអ្នកទិញ/អ្នកលក់ (Taker Buy vs Sell) → Zone ទិញ/លក់ → Pre-order ជាមួយ SL, TP1, TP2
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[oklch(0.8_0.15_85)]" />
            Auto 15s
          </label>
          <button onClick={load} disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? "កំពុងទាញ..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={symIdx} onChange={(e) => setSymIdx(+e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
                {SYMBOLS.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}
              </select>
              {TFS.map((t) => <button key={t.id} onClick={() => setTf(t.id)} className={pill(tf === t.id)}>{t.label}</button>)}
              <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500 align-middle" />Delta +</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-500 align-middle" />Delta −</span>
                <span><span className="mr-1 inline-block h-0.5 w-4 bg-amber-400 align-middle" />POC</span>
              </div>
            </div>
            <div ref={boxRef} className="h-[540px] w-full" />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">ប្រវត្តិ Pre-order (ថ្មីបំផុតនៅលើ)</div>
            {orders.length === 0 ? (
              <div className="text-sm text-muted-foreground">មិនទាន់មាន Zone ទេ។ សាកល្បងបន្ថយ Volume spike ឬ Delta %។</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr><th className="py-2">ម៉ោង</th><th>Order</th><th>Entry</th><th>SL</th><th>TP1</th><th>ស្ថានភាព</th></tr>
                  </thead>
                  <tbody>
                    {[...orders].reverse().slice(0, 14).map((o) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="py-2 text-muted-foreground">{fmtTime(o.time)}</td>
                        <td className={o.dir === "BUY" ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>{o.dir} LIMIT</td>
                        <td>{fp(o.entry)}</td>
                        <td className="text-rose-400">{fp(o.sl)}</td>
                        <td className="text-emerald-400">{fp(o.tp1)}</td>
                        <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[o.status]}`}>{STATUS_TEXT[o.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Pre-order បច្ចុប្បន្ន</div>
            {active ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-xl border px-3 py-1.5 text-lg font-bold ${
                    active.dir === "BUY" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" : "border-rose-500/30 bg-rose-500/15 text-rose-400"}`}>
                    {active.dir} LIMIT
                  </span>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_CLS[active.status]}`}>{STATUS_TEXT[active.status]}</span>
                </div>
                <div className={box}>
                  <div className={cap}>{active.dir === "BUY" ? "Buy zone" : "Sell zone"}</div>
                  <b className="tabular-nums">{fp(active.zoneLo)} – {fp(active.zoneHi)}</b>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm tabular-nums">
                  <div className={box}><div className={cap}>Entry</div><b>{fp(active.entry)}</b></div>
                  <div className={box}><div className={cap}>SL</div><b className="text-rose-400">{fp(active.sl)}</b></div>
                  <div className={box}><div className={cap}>TP1</div><b className="text-emerald-400">{fp(active.tp1)}</b></div>
                  <div className={box}><div className={cap}>TP2</div><b className="text-emerald-400">{fp(active.tp2)}</b></div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  <div className="mb-1 font-semibold text-foreground">ហេតុផល Order Flow</div>
                  {KIND_TEXT[active.kind]}
                  <div className="mt-1 tabular-nums">
                    Delta {(active.dp * 100).toFixed(0)}% · Volume {active.volx.toFixed(1)}× មធ្យម · {fmtTime(active.time)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">មិនទាន់មាន Zone ទេ</div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">ស្ថានភាព Flow (20 candle)</div>
            <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
              <div className={box}>
                <div className={cap}>Buy %</div>
                <b className={buyPct >= 50 ? "text-emerald-400" : "text-rose-400"}>{buyPct}%</b>
              </div>
              <div className={box}>
                <div className={cap}>CVD</div>
                <b className={cvdTrend >= 0 ? "text-emerald-400" : "text-rose-400"}>{cvdTrend >= 0 ? "▲ ឡើង" : "▼ ចុះ"}</b>
              </div>
              <div className={box}>
                <div className={cap}>Delta ចុង</div>
                <b className={lastBar && lastBar.delta >= 0 ? "text-emerald-400" : "text-rose-400"}>{lastBar ? fv(lastBar.delta) : "-"}</b>
              </div>
            </div>
            {prof && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm tabular-nums">
                <div className={box}><div className={cap}>VAH</div><b>{fp(prof.vah)}</b></div>
                <div className={box}><div className={cap}>POC</div><b className="text-primary">{fp(prof.list[prof.poc].price)}</b></div>
                <div className={box}><div className={cap}>VAL</div><b>{fp(prof.val)}</b></div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-1 text-sm font-semibold">ដានជើង (Footprint ladder)</div>
            <div className="mb-3 text-[11px] text-muted-foreground">ក្រហម = អ្នកលក់ · បៃតង = អ្នកទិញ · ដិត = Imbalance ≥ 3:1 · POC មានស៊ុម</div>
            {prof && (
              <div className="max-h-[430px] space-y-px overflow-y-auto pr-1 text-[11px] tabular-nums">
                {[...prof.list].map((r, k) => ({ r, k })).reverse().map(({ r, k }) => {
                  const bImb = r.sell > 0 ? r.buy / r.sell >= 3 : r.buy > 0;
                  const sImb = r.buy > 0 ? r.sell / r.buy >= 3 : r.sell > 0;
                  const strong = r.total >= prof.avgTotal;
                  return (
                    <div key={k} className={`grid grid-cols-[1fr_64px_1fr] items-center gap-1 rounded ${k === prof.poc ? "outline outline-1 outline-amber-400/70" : ""}`}>
                      <div className="flex items-center justify-end gap-1">
                        <span className={sImb && strong ? "font-bold text-rose-400" : "text-muted-foreground"}>{fv(r.sell)}</span>
                        <div className="h-3 rounded-l bg-rose-500/70" style={{ width: `${(r.sell / prof.maxSide) * 60}%` }} />
                      </div>
                      <div className="text-center text-foreground">{fp(r.price)}</div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 rounded-r bg-emerald-500/70" style={{ width: `${(r.buy / prof.maxSide) * 60}%` }} />
                        <span className={bImb && strong ? "font-bold text-emerald-400" : "text-muted-foreground"}>{fv(r.buy)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">Backtest (≈500 candle)</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className={box}><div className={cap}>Orders</div><b>{orders.length}</b></div>
              <div className={box}><div className={cap}>Win rate</div><b className="text-primary">{winRate}%</b></div>
              <div className={box}><div className={cap}>Win / Loss</div><b>{wins} / {losses}</b></div>
              <div className={box}><div className={cap}>Net R</div><b className={netR >= 0 ? "text-emerald-400" : "text-rose-400"}>{netR}R</b></div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              គិតតែ Order ដែលបានចូល ({filled}) ដោយ TP1 vs SL។ មិនទាន់ប៉ះ/ផុតកំណត់: {missed}។ បើប៉ះ SL និង TP ក្នុង candle តែមួយ គិតថាចាញ់។ ស្ថិតិអតីតកាល មិនធានាអនាគតទេ។
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">⚙️ Settings</div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Volume spike (× មធ្យម 20 candle)</label>
                <select value={mult} onChange={(e) => setMult(+e.target.value)} className={sel}>
                  {[1.2, 1.5, 2, 2.5, 3].map((v) => <option key={v} value={v}>{v}×</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Delta imbalance (% នៃ volume)</label>
                <select value={imb} onChange={(e) => setImb(+e.target.value)} className={sel}>
                  {[15, 20, 30, 40, 50].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Pre-order entry</label>
                <select value={entry} onChange={(e) => setEntry(e.target.value as "mid" | "edge")} className={sel}>
                  <option value="mid">កណ្តាល Zone (50%)</option>
                  <option value="edge">គែម Zone (ចូលលឿន)</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Risk : Reward (TP1)</label>
                <select value={rr} onChange={(e) => setRr(+e.target.value)} className={sel}>
                  {[1, 1.5, 2, 2.5, 3].map((v) => <option key={v} value={v}>1 : {v}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>SL buffer (× ATR)</label>
                <select value={buf} onChange={(e) => setBuf(+e.target.value)} className={sel}>
                  {[0.1, 0.2, 0.3, 0.5, 0.8].map((v) => <option key={v} value={v}>{v} × ATR</option>)}
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={cvdFilter} onChange={(e) => setCvdFilter(e.target.checked)} className="accent-[oklch(0.8_0.15_85)]" />
                តាម CVD trend (សម្រាប់ Imbalance zone)
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-3 text-sm font-semibold text-primary">📋 Setup (ច្បាប់ Order Flow)</div>
            <ol className="space-y-2.5 text-sm leading-relaxed">
              <li><b>1. Volume spike៖</b> Candle ដែល volume ធំជាង {mult}× មធ្យម 20 candle (មានអ្នកធំចូល)។</li>
              <li><b>2. Delta៖</b> Delta = Taker Buy − Taker Sell។ ត្រូវមាន Delta ≥ {imb}% នៃ volume។</li>
              <li><b>3. BUY ZONE៖</b> (ក) Absorption: អ្នកលក់វាយខ្លាំង តែតម្លៃបិទខាងលើ នៅ low ថ្មី។ ឬ (ខ) Imbalance: Delta ឡើងខ្លាំង + candle បៃតងធំ → Zone = candle ក្រហមចុងក្រោយមុនបំបែក។</li>
              <li><b>4. SELL ZONE៖</b> ផ្ទុយពី BUY ZONE ទាំងស្រុង។</li>
              <li><b>5. Pre-order៖</b> ដាក់ LIMIT នៅ Zone ({entry === "mid" ? "កណ្តាល" : "គែម"}) · SL ក្រៅ Zone + {buf}×ATR · TP1 = 1:{rr} · TP2 = 1.5×TP1។</li>
              <li><b>6. បោះបង់៖</b> បើ candle បិទហួស Zone មុនប៉ះ ឬអស់ 40 candle។</li>
            </ol>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              ទិន្នន័យ Delta មកពី Binance (Taker Buy/Sell ពិតប្រាកដ ក្នុងមួយ candle)។ Footprint ladder ចែកចាយ volume តាមកម្រិតតម្លៃក្នុង candle (ប្រហាក់ប្រហែល មិនមែន tick-by-tick ទេ)។ តម្លៃ XAUUSDT អាចខុសបន្តិចពី XAUUSD របស់ broker/MT5។ Signal គិតលើ candle ដែលបិទរួចតែប៉ុណ្ណោះ។ ជាឧបករណ៍ជំនួយ មិនមែនការផ្តល់ដំបូន្មានវិនិយោគទេ។ តេស្តលើ demo ហើយប្រថុយ 1–2% ក្នុងមួយ trade។
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
