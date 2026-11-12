import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANALYZE_MODEL || "claude-opus-5-5";
const FALLBACK = "claude-sonnet-5-5";
const EFFORT = process.env.ANALYZE_EFFORT || "high";

const MODES = {
  scalp: { label: "Scalping", tfs: ["1h", "15min", "5min"], names: ["H1 (bias)", "M15 (context)", "M5 (entry)"], raw: [30, 50, 80] },
  day: { label: "Daily trade", tfs: ["4h", "1h", "15min"], names: ["H4 (bias)", "H1 (context)", "M15 (entry)"], raw: [30, 50, 80] },
  swing: { label: "Swing", tfs: ["1week", "1day", "4h"], names: ["W1 (bias)", "D1 (context)", "H4 (entry)"], raw: [30, 50, 80] },
} as const;
type Mode = keyof typeof MODES;

type C = { t: string; o: number; h: number; l: number; c: number };

const nf = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(2) : x.toFixed(5));

async function getCandles(symbol: string, interval: string, size: number): Promise<C[]> {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    symbol
  )}&interval=${interval}&outputsize=${size}&timezone=UTC&apikey=${process.env.TWELVEDATA_API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (json.status === "error") throw new Error(json.message);
  return (json.values as any[]).reverse().map((v) => ({ t: String(v.datetime), o: +v.open, h: +v.high, l: +v.low, c: +v.close }));
}

function ema(vals: number[], p: number) {
  const k = 2 / (p + 1);
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) out.push(i === 0 ? vals[0] : vals[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsi(vals: number[], p = 14) {
  if (vals.length <= p) return 50;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = vals[i] - vals[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function atrN(cs: C[], p = 14) {
  let out = 0;
  for (let i = 0; i < cs.length; i++) {
    const pc = i > 0 ? cs[i - 1].c : cs[i].c;
    const tr = Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - pc), Math.abs(cs[i].l - pc));
    out = i === 0 ? tr : i < p ? (out * i + tr) / (i + 1) : (out * (p - 1) + tr) / p;
  }
  return out;
}

function swings(cs: C[], L = 3) {
  const highs: { p: number; t: string }[] = [];
  const lows: { p: number; t: string }[] = [];
  for (let i = L; i < cs.length - L; i++) {
    let isH = true, isL = true;
    for (let j = i - L; j <= i + L; j++) {
      if (j === i) continue;
      if (cs[j].h > cs[i].h) isH = false;
      if (cs[j].l < cs[i].l) isL = false;
    }
    if (isH) highs.push({ p: cs[i].h, t: cs[i].t });
    if (isL) lows.push({ p: cs[i].l, t: cs[i].t });
  }
  return { highs, lows };
}

function summarize(cs: C[], name: string, rawN: number) {
  const closes = cs.map((x) => x.c);
  const last = cs[cs.length - 1];
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const a = atrN(cs);
  const r = rsi(closes);
  const sw = swings(cs, 3);
  const hs = sw.highs.slice(-3), ls = sw.lows.slice(-3);
  const win = cs.slice(-50);
  const hi = Math.max(...win.map((x) => x.h));
  const lo = Math.min(...win.map((x) => x.l));
  const rel = e50[e50.length - 1] > e200[e200.length - 1] ? "EMA50 above EMA200 (uptrend bias)" : "EMA50 below EMA200 (downtrend bias)";
  const lines = cs.slice(-rawN).map((x) => `${x.t},${x.o},${x.h},${x.l},${x.c}`).join("\n");
  const text =
    `### ${name}\n` +
    `Last close ${nf(last.c)} | EMA20 ${nf(e20[e20.length - 1])} EMA50 ${nf(e50[e50.length - 1])} EMA200 ${nf(e200[e200.length - 1])} | ${rel} | ATR14 ${nf(a)} | RSI14 ${r.toFixed(1)}\n` +
    `50-bar range: high ${nf(hi)} low ${nf(lo)} (premium/discount midpoint ${nf((hi + lo) / 2)})\n` +
    `Recent swing highs: ${hs.map((s) => `${nf(s.p)}@${s.t}`).join("; ") || "-"}\n` +
    `Recent swing lows: ${ls.map((s) => `${nf(s.p)}@${s.t}`).join("; ") || "-"}\n` +
    `Candles (time,open,high,low,close), oldest first:\n${lines}`;
  return { atr: a, text };
}

const BIN: Record<string, string> = { "XAU/USD": "PAXGUSDT", "BTC/USD": "BTCUSDT", "ETH/USD": "ETHUSDT" };
const BIN_TF: Record<string, string> = { "5min": "5m", "15min": "15m", "1h": "1h", "4h": "4h", "1day": "1d", "1week": "1w" };

async function orderFlow(symbol: string, tf: string): Promise<string | null> {
  const bs = BIN[symbol], bi = BIN_TF[tf];
  if (!bs || !bi) return null;
  try {
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${bs}&interval=${bi}&limit=60`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    const j = await res.json();
    if (!Array.isArray(j)) return null;
    const rows = j.map((k: any[]) => {
      const vol = +k[5], buy = +k[9];
      return { t: new Date(k[0]).toISOString().slice(0, 16).replace("T", " "), c: +k[4], vol, delta: buy - (vol - buy) };
    });
    const l20 = rows.slice(-20);
    const sumD = l20.reduce((s, r) => s + r.delta, 0);
    const sumV = l20.reduce((s, r) => s + r.vol, 0);
    const buyPct = sumV > 0 ? Math.round(((sumV + sumD) / 2 / sumV) * 100) : 50;
    const lines = rows.slice(-30).map((r) => `${r.t},${r.c},${r.vol.toFixed(2)},${r.delta.toFixed(2)}`).join("\n");
    return (
      `Source: Binance ${bs} spot (for gold this is PAXG, a gold-backed token, so volume is thinner than OTC gold; treat it as a rough read of pressure), ${bi} candles. Real taker data: delta = taker buy volume minus taker sell volume. ` +
      `Prices can differ slightly from spot ${symbol}, so use it for buying/selling PRESSURE only, not for price levels.\n` +
      `Last 20 candles: net delta ${sumD.toFixed(2)}, buy share ${buyPct}% (${sumD >= 0 ? "buyers dominate" : "sellers dominate"}).\n` +
      `Last 30 candles (time,close,volume,delta):\n${lines}`
    );
  } catch {
    return null;
  }
}

async function calendar(): Promise<string | null> {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    const j = await res.json();
    if (!Array.isArray(j)) return null;
    const now = Date.now();
    const ev = (j as any[])
      .filter((e) => e.impact === "High" && ["USD", "EUR", "GBP", "JPY"].includes(e.country))
      .map((e) => ({ ...e, ms: Date.parse(e.date) - now }))
      .filter((e) => e.ms > -3 * 3600e3 && e.ms < 36 * 3600e3)
      .sort((a, b) => a.ms - b.ms)
      .slice(0, 8);
    if (!ev.length) return "No high-impact USD/EUR/GBP/JPY events within the next 36 hours.";
    return ev
      .map((e) => {
        const m = Math.round(e.ms / 60000);
        return `${e.country} ${e.title}: ${m >= 0 ? `in ${m} min` : `${-m} min ago`} (forecast ${e.forecast || "-"}, previous ${e.previous || "-"})`;
      })
      .join("\n");
  } catch {
    return null;
  }
}

const SYSTEM = `You are a disciplined senior ICT/SMC and order-flow trader. Work through these steps silently, then answer.
1. HTF bias (first timeframe): market structure (HH/HL vs LH/LL), EMA alignment, and where price sits in the 50-bar range (premium vs discount).
2. Context timeframe: liquidity pools (equal highs/lows, previous swing highs/lows), unmitigated order blocks, fair value gaps, and price location relative to them.
3. Entry timeframe: look for a trigger such as a liquidity sweep followed by CHoCH/BOS, or a retest of an OB/FVG, and check it against the order-flow data (delta, absorption, CVD direction) when provided.
4. News: a High-impact event within 30 minutes (before or after) means newsRisk "avoid"; within 2 hours means "caution"; otherwise "none".

Rules:
- Use only prices that appear in the data. Never invent levels.
- Prefer LIMIT entries at an order block / FVG / retest level. Use MARKET only if the trigger candle has already closed and price is still near the entry.
- Stop loss goes beyond the structure that invalidates the idea, at least 0.5 x ATR(entry timeframe) away from entry.
- TP1 = nearest opposing liquidity or swing level, TP2 = the next one. Minimum RR to TP1 is 1.5. If no logical SL gives RR >= 1.5, answer NO TRADE.
- If the HTF bias conflicts with the entry trigger, or price is mid-range with no edge, answer NO TRADE and say exactly what to wait for in "waitFor".
- Confidence: 40-60 for ordinary setups; above 70 only when bias, liquidity, trigger, order flow and news all agree. Never above 85.
- The last candle of each timeframe may still be forming.

Return ONLY valid JSON, no markdown, with this shape:
{"bias":"bullish|bearish|neutral","setup":"short name","direction":"BUY|SELL|NO TRADE","entryType":"LIMIT|MARKET",
"entry":number,"sl":number,"tp1":number,"tp2":number,"rr":number,"confidence":number,
"waitFor":"what must happen before entering (empty string if nothing)","invalidation":"text",
"reasoning":["point","point","point","point"],
"scenarios":{"bullish":"text","bearish":"text"},
"newsRisk":"none|caution|avoid","newsNote":"text",
"keyLevels":{"support":[numbers],"resistance":[numbers]}}
Write every text field in Khmer. Keep numbers, and terms such as BOS, CHoCH, FVG, OB, LIMIT, in English.`;

async function callClaude(model: string, user: string) {
  const params: any = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    output_config: { effort: EFFORT },
  };
  return client.messages.create(params);
}

function validate(a: any, price: number, atr: number | null) {
  const w: string[] = Array.isArray(a.warnings) ? a.warnings : [];
  const num = (x: any) => typeof x === "number" && isFinite(x);
  if (a.direction === "BUY" || a.direction === "SELL") {
    const { entry, sl, tp1, tp2 } = a;
    const ok =
      [entry, sl, tp1, tp2].every(num) &&
      (a.direction === "BUY" ? sl < entry && entry < tp1 && tp1 <= tp2 : sl > entry && entry > tp1 && tp1 >= tp2);
    if (!ok) {
      a.direction = "NO TRADE";
      w.push("លេខ Entry/SL/TP ដែល AI ផ្តល់មិនសមហេតុផលតាមទិស ដូច្នេះប្តូរទៅ NO TRADE");
    } else {
      const rr = Math.abs(tp1 - entry) / Math.abs(entry - sl);
      a.rr = +rr.toFixed(2);
      if (rr < 1.2) {
        a.direction = "NO TRADE";
        w.push(`RR (${a.rr}) ទាបពេក ដូច្នេះមិនគួរ trade`);
      }
      if (atr && Math.abs(entry - price) > 3 * atr) w.push("Entry ឆ្ងាយពីតម្លៃបច្ចុប្បន្នលើស 3×ATR (ប្រហែលមិនប៉ះឆាប់ៗ)");
      if (atr && Math.abs(entry - sl) > 3 * atr) w.push("SL ធំជាង 3×ATR (ហានិភ័យខ្ពស់)");
    }
  }
  if (num(a.confidence)) a.confidence = Math.max(0, Math.min(85, Math.round(a.confidence)));
  a.warnings = w;
  return a;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const { symbol = "XAU/USD", mode = "scalp" } = await req.json();
    const cfg = MODES[mode as Mode];
    if (!cfg) return NextResponse.json({ error: "bad mode" }, { status: 400 });

    const sets = await Promise.all(cfg.tfs.map((tf) => getCandles(symbol, tf, 220)));
    const sums = sets.map((cs, i) => summarize(cs, cfg.names[i], cfg.raw[i]));
    const entryTf = cfg.tfs[2];
    const [flow, cal] = await Promise.all([orderFlow(symbol, entryTf), calendar()]);
    const price = sets[2][sets[2].length - 1].c;

    const user =
      `Symbol: ${symbol}\nStyle: ${cfg.label}\nNow (UTC): ${new Date().toISOString()}\n` +
      `Current price (last ${entryTf} close, may still be forming): ${nf(price)}\n\n` +
      `${sums.map((s) => s.text).join("\n\n")}\n\n` +
      `## ORDER FLOW\n${flow ?? "Not available for this symbol."}\n\n` +
      `## HIGH-IMPACT NEWS (next 36h)\n${cal ?? "Calendar unavailable."}`;

    let used = MODEL;
    let msg: any;
    try {
      msg = await callClaude(MODEL, user);
    } catch (e: any) {
      if (MODEL === FALLBACK) throw e;
      used = FALLBACK;
      msg = await callClaude(FALLBACK, user);
    }

    const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI did not return JSON. Raw: " + text.slice(0, 200));
    const analysis = validate(JSON.parse(m[0]), price, sums[2].atr);

    return NextResponse.json({
      symbol,
      mode,
      analysis,
      meta: { model: used, seconds: Math.round((Date.now() - t0) / 100) / 10, orderFlow: !!flow, news: !!cal },
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
