import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { gate } from "@/lib/gate";
import { MODES, SYSTEM, validate, buildContext, consensus, type Mode, type AiResult } from "@/lib/market-context";

// Three AIs run in parallel; each has its own 100s timeout so one slow AI cannot break the others.
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CLAUDE_MODEL = process.env.ANALYZE_MODEL || "claude-opus-5-5";
const CLAUDE_FALLBACK = "claude-sonnet-5-5";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const TIMEOUT = 100000;

type Out = { text: string; model: string };

async function callClaude(user: string): Promise<Out> {
  const go = async (model: string) => {
    const params: any = {
      model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { effort: process.env.ANALYZE_EFFORT || "high" },
    };
    const msg: any = await client.messages.create(params, { timeout: TIMEOUT });
    return msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  };
  try {
    return { text: await go(CLAUDE_MODEL), model: CLAUDE_MODEL };
  } catch (e) {
    if (CLAUDE_MODEL === CLAUDE_FALLBACK) throw e;
    return { text: await go(CLAUDE_FALLBACK), model: CLAUDE_FALLBACK };
  }
}

async function callOpenAI(user: string): Promise<Out> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("មិនទាន់ដាក់ OPENAI_API_KEY");
  const body: any = {
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    text: { format: { type: "json_object" } },
    reasoning: { effort: process.env.OPENAI_EFFORT || "high" },
    max_output_tokens: 16000,
  };
  const go = async (b: any) => {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return { res, j: await res.json().catch(() => ({})) };
  };
  let r = await go(body);
  if (!r.res.ok && body.reasoning) {
    delete body.reasoning; // some models reject the reasoning option: retry without it
    r = await go(body);
  }
  if (!r.res.ok) throw new Error(r.j?.error?.message || `HTTP ${r.res.status}`);
  const text = (r.j.output || [])
    .filter((o: any) => o.type === "message")
    .flatMap((o: any) => o.content || [])
    .map((c: any) => c.text || "")
    .join("");
  return { text, model: OPENAI_MODEL };
}

async function callGemini(user: string): Promise<Out> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("មិនទាន់ដាក់ GEMINI_API_KEY");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 16000 },
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  const text = (j.candidates?.[0]?.content?.parts || [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text || "")
    .join("");
  return { text, model: GEMINI_MODEL };
}

async function run(id: string, label: string, model: string, fn: () => Promise<Out>): Promise<AiResult> {
  const t0 = Date.now();
  const secs = () => Math.round((Date.now() - t0) / 100) / 10;
  try {
    const out = await fn();
    const m = out.text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI មិនបានឆ្លើយជា JSON");
    return { id, label, model: out.model, ok: true, seconds: secs(), analysis: JSON.parse(m[0]) };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" || /abort|timeout/i.test(String(e?.message)) ? "ចំណាយពេលយូរពេក (លើស 100 វិនាទី)" : String(e?.message || e);
    return { id, label, model, ok: false, seconds: secs(), error: msg.slice(0, 300) };
  }
}

export async function POST(req: Request) {
  const g = gate(req);
  if (g) return g;
  try {
    const { symbol = "XAU/USD", mode = "scalp" } = await req.json();
    if (!(mode in MODES)) return NextResponse.json({ error: "bad mode" }, { status: 400 });

    const ctx = await buildContext(symbol, mode as Mode);
    const results = await Promise.all([
      run("claude", "Claude", CLAUDE_MODEL, () => callClaude(ctx.user)),
      run("openai", "ChatGPT", OPENAI_MODEL, () => callOpenAI(ctx.user)),
      run("gemini", "Gemini", GEMINI_MODEL, () => callGemini(ctx.user)),
    ]);
    results.forEach((r) => {
      if (r.ok) r.analysis = validate(r.analysis, ctx.price, ctx.atr);
    });
    const c = consensus(results, ctx.price, ctx.atr);

    return NextResponse.json({
      symbol,
      mode,
      results,
      consensus: c,
      meta: { price: ctx.price, orderFlow: ctx.flow, news: ctx.news },
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
