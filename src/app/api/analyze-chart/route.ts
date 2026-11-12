import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANALYZE_MODEL || "claude-opus-5-5";
const FALLBACK = "claude-sonnet-5-5";
const EFFORT = process.env.ANALYZE_EFFORT || "high";

const STYLES: Record<string, string> = {
  scalp: "Scalping (entries on M5/M15, quick targets)",
  day: "Daily trade (entries on M15/H1, targets within the day)",
  swing: "Swing (entries on H4/D1, targets over days or weeks)",
};

const SYSTEM = `You are a disciplined senior ICT/SMC trader reading a chart screenshot.
Work silently: identify the symbol and timeframe if visible; read the price scale on the right carefully; judge structure (HH/HL vs LH/LL), liquidity (equal highs/lows, sweeps), FVG, order blocks, premium/discount; then decide.
Rules:
- Use only price levels you can actually read from the axis. Prices read from an image are approximate; say so in "reasoning".
- If the price axis is unreadable, the chart is too zoomed in/out, or there is no clean setup, answer NO TRADE and say what you need (for example a clearer screenshot).
- Prefer LIMIT entries at an order block / FVG / retest. SL beyond the invalidating structure. TP1 = nearest opposing liquidity, TP2 = the next. Minimum RR to TP1 is 1.5, otherwise NO TRADE.
- Confidence 40-60 for ordinary setups, above 70 only when everything agrees, never above 85.
Return ONLY valid JSON, no markdown:
{"detected":{"symbol":"text","timeframe":"text"},"bias":"bullish|bearish|neutral","setup":"short name",
"direction":"BUY|SELL|NO TRADE","entryType":"LIMIT|MARKET","entry":number,"sl":number,"tp1":number,"tp2":number,"rr":number,
"confidence":number,"waitFor":"text or empty","invalidation":"text","reasoning":["point","point","point"],
"scenarios":{"bullish":"text","bearish":"text"},"newsRisk":"none","newsNote":"",
"keyLevels":{"support":[numbers],"resistance":[numbers]}}
Write every text field in Khmer. Keep numbers and terms such as BOS, CHoCH, FVG, OB, LIMIT in English.`;

async function callClaude(model: string, content: any) {
  const params: any = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { effort: EFFORT },
  };
  return client.messages.create(params);
}

function validate(a: any) {
  const w: string[] = Array.isArray(a.warnings) ? a.warnings : [];
  const num = (x: any) => typeof x === "number" && isFinite(x);
  if (a.direction === "BUY" || a.direction === "SELL") {
    const { entry, sl, tp1, tp2 } = a;
    const ok =
      [entry, sl, tp1, tp2].every(num) &&
      (a.direction === "BUY" ? sl < entry && entry < tp1 && tp1 <= tp2 : sl > entry && entry > tp1 && tp1 >= tp2);
    if (!ok) {
      a.direction = "NO TRADE";
      w.push("លេខ Entry/SL/TP ដែល AI អានពីរូបមិនសមហេតុផលតាមទិស ដូច្នេះប្តូរទៅ NO TRADE");
    } else {
      const rr = Math.abs(tp1 - entry) / Math.abs(entry - sl);
      a.rr = +rr.toFixed(2);
      if (rr < 1.2) {
        a.direction = "NO TRADE";
        w.push(`RR (${a.rr}) ទាបពេក ដូច្នេះមិនគួរ trade`);
      }
    }
  }
  w.push("តម្លៃអានពីរូប ប្រហាក់ប្រហែលប៉ុណ្ណោះ សូមផ្ទៀងផ្ទាត់ជាមួយ chart ពិតមុនចូល");
  if (num(a.confidence)) a.confidence = Math.max(0, Math.min(85, Math.round(a.confidence)));
  a.warnings = w;
  return a;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const { image, mode = "scalp", symbol = "" } = await req.json();
    if (!image) return NextResponse.json({ error: "No image" }, { status: 400 });
    const base64 = String(image).includes(",") ? String(image).split(",")[1] : String(image);

    const content = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
      {
        type: "text",
        text: `Trading style: ${STYLES[mode] || STYLES.scalp}.${symbol ? ` Symbol hint: ${symbol}.` : ""} Now (UTC): ${new Date().toISOString()}. Analyze this chart.`,
      },
    ];

    let used = MODEL;
    let msg: any;
    try {
      msg = await callClaude(MODEL, content);
    } catch (e: any) {
      if (MODEL === FALLBACK) throw e;
      used = FALLBACK;
      msg = await callClaude(FALLBACK, content);
    }

    const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI did not return JSON. Raw: " + text.slice(0, 200));
    const analysis = validate(JSON.parse(m[0]));

    return NextResponse.json({
      analysis,
      meta: { model: used, seconds: Math.round((Date.now() - t0) / 100) / 10, orderFlow: false, news: false },
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
