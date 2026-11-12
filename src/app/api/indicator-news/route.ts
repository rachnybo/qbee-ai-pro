import { NextResponse } from 'next/server'


export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get('symbol') || 'BTCUSDT'
  const cat = symbol.startsWith('ETH') ? 'ETH' : symbol.startsWith('SOL') ? 'SOL' : 'BTC'
  try {
    const headers: Record<string, string> = {}
    if (process.env.CRYPTOCOMPARE_API_KEY) headers.authorization = `Apikey ${process.env.CRYPTOCOMPARE_API_KEY}`
    const r = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${cat},Market,Regulation`, { headers, cache: 'no-store' })
    const j = await r.json()
    const items = (j.Data || []).slice(0, 15).map((n: any) => ({
      title: n.title,
      source: n.source_info?.name || n.source,
      url: n.url,
      time: n.published_on * 1000,
    }))
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}

