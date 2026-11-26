import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { gate } from "@/lib/gate";
import { validate, buildContext } from "@/lib/market-context";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANALYZE_MODEL || "claude-opus-5-5";
const FALLBACK = "claude-sonnet-5-5";

const SYSTEM = `You are a senior macro/news trader specialised in gold (XAUUSD) and USD pairs. The user is about to trade around a scheduled high-impact USD news release and wants a briefing about 5 minutes before it.
You receive: multi-timeframe market data with indicators, real order-flow pressure when available, the event (title, forecast, previous, minutes until release) and the current time.

Deliver:
1. whyItMatters: why this event moves USD and gold (rate expectations, yields). beatMeans: what counts as a "beat" vs a "miss" for THIS event and what each normally does to USD and gold. Be careful with inverted indicators: for unemployment or jobless claims, a HIGHER number is weak for USD and bullish for gold.
2. technicalPicture: pre-news structure: nearest liquidity pools above and below, key levels, whether price is compressed, and where stops probably sit.
3. Conditional scenarios BEAT, MISS and INLINE. You do NOT know the outcome, so never predict it. For each scenario give the likely first reaction of gold, the trigger that must happen AFTER the release (for example a candle close beyond a level, or a retest), and a trade plan with entry, sl, tp1, tp2 using ONLY price levels that appear in the data. Direction BUY, SELL or NO TRADE. Minimum RR to TP1 is 1.5, otherwise NO TRADE for that scenario. Entry, sl and tps must be consistent with the direction.
4. preNewsAction: NO_NEW_TRADES (default; consider trimming or closing open trades), PENDING_ORDERS (only if price is compressed with clear levels; mention spread and slippage risk), or WAIT_FOR_RETEST.
5. riskNotes: spread widening, slippage, whipsaw; sizeAdvice: a smaller size such as 25-50% of normal; waitMinutesAfter: how many minutes to wait after the release before acting.
Confidence is for the quality of the briefing and never above 75. The last candle may still be forming.

Return ONLY valid JSON, no markdown:
{"event":"text","whyItMatters":"text","beatMeans":"text","technicalPicture":"text",
"preNewsAction":"NO_NEW_TRADES|PENDING_ORDERS|WAIT_FOR_RETEST","preNewsNote":"text",
"scenarios":{"beat":{"goldReaction":"text","trigger":"text","direction":"BUY|SELL|NO TRADE","entry":number,"sl":number,"tp1":number,"tp2":number},
"miss":{"goldReaction":"text","trigger":"text","direction":"BUY|SELL|NO TRADE","entry":number,"sl":number,"tp1":number,"tp2":number},
"inline":{"goldReaction":"text","trigger":"text","direction":"BUY|SELL|NO TRADE","entry":number,"sl":number,"tp1":number,"tp2":number}},
"levels":{"above":[numbers],"below":[numbers]},"riskNotes":["text"],"sizeAdvice":"text","waitMinutesAfter":number,"confidence":number}
Write every text field in Khmer. Keep numbers and terms such as NFP, CPI, FOMC, LIMIT, BOS in English.`;

async function callClaude(user: string) {
  const go = async (model: string) => {
    const params: any = {
      model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { effort: process.env.ANALYZE_EFFORT || "high" },
    };
    const msg: any = await client.messages.create(params, { timeout: 100000 });
    return msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  };
  try {
    return { text: await go(MODEL), model: MODEL };
  } catch (e) {
    if (MODEL === FALLBACK) throw e;
    return { text: await go(FALLBACK), model: FALLBACK };
  }
}

function fix(s: any, price: number, atr: number | null) {
  if (!s || typeof s !== "object") return { direction: "NO TRADE", warnings: [] as string[] };
  const v = validate({ direction: s.direction, entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, confidence: 50, warnings: [] }, price, atr);
  return { ...s, direction: v.direction, rr: v.rr, warnings: v.warnings };
}

export async function POST(req: Request) {
  const g = gate(req);
  if (g) return g;
  const t0 = Date.now();
  try {
    const { symbol = "XAU/USD", event } = await req.json();
    if (!event?.title || !event?.date) return NextResponse.json({ error: "missing event" }, { status: 400 });

    const minutes = Math.round((Date.parse(event.date) - Date.now()) / 60000);
    const ctx = await buildContext(symbol, "scalp");
    const user =
      `## EVENT\nTitle: ${event.title}\nCountry: USD\nImpact: ${event.impact || "High"}\nScheduled (ISO): ${event.date}\n` +
      `Minutes until release: ${minutes} (negative = already released)\nForecast: ${event.forecast || "n/a"}\nPrevious: ${event.previous || "n/a"}\n\n` +
      ctx.user;

    const out = await callClaude(user);
    const m = out.text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI មិនបានឆ្លើយជា JSON");
    const a = JSON.parse(m[0]);

    a.scenarios = {
      beat: fix(a.scenarios?.beat, ctx.price, ctx.atr),
      miss: fix(a.scenarios?.miss, ctx.price, ctx.atr),
      inline: fix(a.scenarios?.inline, ctx.price, ctx.atr),
    };
    if (typeof a.confidence === "number") a.confidence = Math.max(0, Math.min(75, Math.round(a.confidence)));
    if (!["NO_NEW_TRADES", "PENDING_ORDERS", "WAIT_FOR_RETEST"].includes(a.preNewsAction)) a.preNewsAction = "NO_NEW_TRADES";

    return NextResponse.json({
      symbol,
      event,
      analysis: a,
      meta: {
        model: out.model,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
        minutesAtAnalysis: minutes,
        price: ctx.price,
        atr: ctx.atr,
        orderFlow: ctx.flow,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
