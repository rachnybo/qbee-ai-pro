import { NextResponse } from 'next/server'


const SYSTEM = `You are a cautious crypto order-flow analyst. You receive JSON with: symbol, timeframe, current price, the last 8 candles (o,h,l,c, delta = buy-sell aggressor volume, vol), a footprint signal already computed by a rules engine (may be null), and recent news headlines, each prefixed with its age in brackets (e.g. [2 ម៉ោងមុន] = 2 hours ago). Weigh fresh news (under ~2 hours) heavily and ignore news older than a day unless it is a major ongoing event.

Task:
1. Judge the overall news sentiment and any high-impact event risk (ETF, regulation, hacks, macro, liquidations).
2. Judge whether the order-flow (delta trend, absorption, stacked imbalance) and the news SUPPORT or CONTRADICT the engine's signal.
3. Be conservative: if headlines are unclear, conflicting, or a big event is likely, answer WAIT or SKIP.
Never output or change prices (entry/SL/TP). The engine owns those.

Reply with ONLY a JSON object, no markdown:
{"action":"TAKE"|"SKIP"|"WAIT","bias":"BUY"|"SELL"|"NEUTRAL","confidence":0-100,"newsSentiment":"BULLISH"|"BEARISH"|"NEUTRAL","risk":"LOW"|"MEDIUM"|"HIGH","summary":"<=2 sentences in Khmer","points":["<=4 short Khmer bullets"]}`

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'ខ្វះ ANTHROPIC_API_KEY ក្នុងឯកសារ .env.local' })
  try {
    const body = await req.json()
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(body) }],
      }),
    })
    const j = await r.json()
    if (!r.ok) return NextResponse.json({ error: `AI error: ${j?.error?.message || r.status}` })
    const text: string = (j.content || []).map((c: any) => c.text || '').join('')
    const a = text.indexOf('{'), b = text.lastIndexOf('}')
    const o = JSON.parse(text.slice(a, b + 1))
    return NextResponse.json({
      action: ['TAKE', 'SKIP', 'WAIT'].includes(o.action) ? o.action : 'WAIT',
      bias: ['BUY', 'SELL', 'NEUTRAL'].includes(o.bias) ? o.bias : 'NEUTRAL',
      confidence: Number(o.confidence) || 0,
      newsSentiment: o.newsSentiment || 'NEUTRAL',
      risk: o.risk || 'MEDIUM',
      summary: o.summary || '',
      points: Array.isArray(o.points) ? o.points.slice(0, 4) : [],
    })
  } catch {
    return NextResponse.json({ error: 'AI ឆ្លើយមិនត្រឹមត្រូវ សូមសាកម្តងទៀត' })
  }
}

