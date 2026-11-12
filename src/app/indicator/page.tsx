'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

// ---------- Types ----------
type Lvl = { b: number; s: number }
type Candle = { t: number; o: number; h: number; l: number; c: number; buy: number; sell: number; lv: Map<number, Lvl>; hasLv: boolean }
type Sig = {
  i: number; side: 'BUY' | 'SELL'; zoneHi: number; zoneLo: number
  entry: number; sl: number; tp1: number; tp2: number
  deltaPct: number; stacked: number; status: string; time: number
}

type NewsItem = { title: string; source: string; url: string; time: number }
type AiResult = {
  action: 'TAKE' | 'SKIP' | 'WAIT'; bias: 'BUY' | 'SELL' | 'NEUTRAL'; confidence: number
  newsSentiment: string; risk: string; summary: string; points: string[]; error?: string
}

const TF_MS: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000 }
const SYMBOLS: Record<string, number> = { BTCUSDT: 10, ETHUSDT: 0.5, SOLUSDT: 0.05 }
const VIS = 14
const r8 = (x: number) => +x.toFixed(8)

// ---------- Footprint helpers ----------
function imbalance(m: Map<number, Lvl>, tk: number) {
  const buyK = new Set<number>(), sellK = new Set<number>()
  m.forEach((v, p) => {
    const below = m.get(r8(p - tk)), above = m.get(r8(p + tk))
    if (below && v.b > 0 && v.b >= 3 * below.s) buyK.add(p)
    if (above && v.s > 0 && v.s >= 3 * above.b) sellK.add(p)
  })
  const stack = (set: Set<number>) => {
    let best = 0
    set.forEach(p => {
      if (set.has(r8(p - tk))) return
      let n = 1
      while (set.has(r8(p + n * tk))) n++
      best = Math.max(best, n)
    })
    return best
  }
  return { buyK, sellK, stackB: stack(buyK), stackS: stack(sellK) }
}

function pocOf(c: Candle) {
  let best = (c.h + c.l) / 2, mx = 0
  c.lv.forEach((v, k) => { if (v.b + v.s > mx) { mx = v.b + v.s; best = k } })
  return best
}

// ---------- Signal engine ----------
function computeSignals(cs: Candle[], P: { tick: number; minDelta: number; volMult: number; slAtr: number; tp1R: number; tp2R: number; entryMode: string }) {
  const out: Sig[] = []
  const n = cs.length
  for (let i = 20; i <= n - 2; i++) {
    const c = cs[i]
    const tot = c.buy + c.sell
    if (tot <= 0 || c.h === c.l) continue
    const deltaPct = ((c.buy - c.sell) / tot) * 100
    let avg = 0
    for (let k = i - 20; k < i; k++) avg += cs[k].buy + cs[k].sell
    avg /= 20
    let atr = 0
    for (let k = i - 13; k <= i; k++) atr += Math.max(cs[k].h - cs[k].l, Math.abs(cs[k].h - cs[k - 1].c), Math.abs(cs[k].l - cs[k - 1].c))
    atr /= 14
    const pos = (c.c - c.l) / (c.h - c.l)
    const strong = tot > avg * P.volMult
    let side: 'BUY' | 'SELL' | null = null
    if (strong && deltaPct >= P.minDelta && c.c > c.o && pos > 0.55) side = 'BUY'
    if (strong && deltaPct <= -P.minDelta && c.c < c.o && pos < 0.45) side = 'SELL'
    if (!side) continue
    const last = out[out.length - 1]
    if (last && last.i >= i - 2 && last.side === side) continue

    let entry = (c.h + c.l) / 2
    if (P.entryMode === 'CLOSE') entry = c.c
    if (P.entryMode === 'POC' && c.hasLv && c.lv.size) entry = pocOf(c)
    const sl = side === 'BUY' ? c.l - atr * P.slAtr : c.h + atr * P.slAtr
    const risk = Math.abs(entry - sl)
    if (risk <= 0) continue
    const dir = side === 'BUY' ? 1 : -1
    const tp1 = entry + dir * risk * P.tp1R
    const tp2 = entry + dir * risk * P.tp2R

    let stacked = 0
    if (c.hasLv && c.lv.size) {
      const im = imbalance(c.lv, P.tick)
      stacked = side === 'BUY' ? im.stackB : im.stackS
    }

    // simulate status on later candles
    let status = 'PENDING', filled = false
    for (let j = i + 1; j < n; j++) {
      const x = cs[j]
      if (!filled) {
        if (j > i + 12) { status = 'EXPIRED'; break }
        const touch = side === 'BUY' ? x.l <= entry : x.h >= entry
        if (!touch) {
          const broke = side === 'BUY' ? x.l <= sl : x.h >= sl
          if (broke) { status = 'INVALID'; break }
          continue
        }
        filled = true
        status = 'FILLED'
      }
      const hitSL = side === 'BUY' ? x.l <= sl : x.h >= sl
      const hit1 = side === 'BUY' ? x.h >= tp1 : x.l <= tp1
      const hit2 = side === 'BUY' ? x.h >= tp2 : x.l <= tp2
      if (hitSL && status !== 'TP1') { status = 'SL'; break }
      if (hit2) { status = 'TP2'; break }
      if (hitSL) break
      if (hit1) status = 'TP1'
    }
    out.push({ i, side, zoneHi: c.h, zoneLo: c.l, entry, sl, tp1, tp2, deltaPct, stacked, status, time: c.t })
  }
  return out
}

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'ទើបតែ'
  if (m < 60) return `${m} នាទីមុន`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ម៉ោងមុន`
  return `${Math.floor(h / 24)} ថ្ងៃមុន`
}
const fmtDate = (t: number) =>
  new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const fmtQ = (v: number) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v)))

// ---------- Page ----------
export default function IndicatorPage() {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [tick, setTick] = useState(10)
  const [tf, setTf] = useState('5m')
  const [minDelta, setMinDelta] = useState(25)
  const [volMult, setVolMult] = useState(1.1)
  const [slAtr, setSlAtr] = useState(0.5)
  const [tp1R, setTp1R] = useState(1)
  const [tp2R, setTp2R] = useState(2)
  const [entryMode, setEntryMode] = useState('50')
  const [status, setStatus] = useState('connecting')
  const [ver, setVer] = useState(0)
  const [w, setW] = useState(1000)
  const [news, setNews] = useState<NewsItem[]>([])
  const [ai, setAi] = useState<AiResult | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiAt, setAiAt] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  const sigsRef = useRef<Sig[]>([])
  const newsRef = useRef<NewsItem[]>([])
  const lastAiKey = useRef(0)
  const initAi = useRef(false)
  const runAIRef = useRef<() => void>(() => {})

  const candles = useRef<Candle[]>([])
  const dirty = useRef(false)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // width observer
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(e => setW(Math.floor(e[0].contentRect.width)))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  // data: history + live aggTrade
  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let timer: any
    const ms = TF_MS[tf]
    candles.current = []
    setStatus('loading')

    function connect() {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@aggTrade`)
      ws.onopen = () => setStatus('live')
      ws.onmessage = e => {
        const d = JSON.parse(e.data)
        const p = +d.p, q = +d.q, t = Math.floor(d.T / ms) * ms
        const isSell = !!d.m // buyer is maker => aggressive SELL
        const cs = candles.current
        let c = cs[cs.length - 1]
        if (!c || t > c.t) {
          c = { t, o: p, h: p, l: p, c: p, buy: 0, sell: 0, lv: new Map(), hasLv: true }
          cs.push(c)
          if (cs.length > 300) cs.shift()
        } else if (t < c.t) return
        c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p
        if (isSell) c.sell += q; else c.buy += q
        const key = r8(Math.floor(p / tick) * tick)
        const lv = c.lv.get(key) || { b: 0, s: 0 }
        if (isSell) lv.s += q; else lv.b += q
        c.lv.set(key, lv)
        c.hasLv = true
        dirty.current = true
      }
      ws.onclose = () => { if (!closed) { setStatus('reconnecting'); timer = setTimeout(connect, 2000) } }
    }

    fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=150`)
      .then(r => r.json())
      .then((ks: any[]) => {
        if (closed) return
        candles.current = ks.map(k => {
          const vol = +k[5], buy = +k[9]
          return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], buy, sell: vol - buy, lv: new Map(), hasLv: false }
        })
        dirty.current = true
        connect()
      })
      .catch(() => setStatus('error: ទាញទិន្នន័យមិនបាន'))

    const iv = setInterval(() => { if (dirty.current) { dirty.current = false; setVer(v => v + 1) } }, 300)
    return () => { closed = true; clearInterval(iv); clearTimeout(timer); ws?.close() }
  }, [symbol, tf, tick])

  const sigs = useMemo(
    () => computeSignals(candles.current, { tick, minDelta, volMult, slAtr, tp1R, tp2R, entryMode }),
    [ver, tick, minDelta, volMult, slAtr, tp1R, tp2R, entryMode] // eslint-disable-line
  )

  sigsRef.current = sigs

  const runAI = async () => {
    const cs = candles.current
    if (cs.length < 10) return
    setAiBusy(true)
    try {
      const recent = cs.slice(-8).map(c => ({ o: c.o, h: c.h, l: c.l, c: c.c, delta: +(c.buy - c.sell).toFixed(2), vol: +(c.buy + c.sell).toFixed(2) }))
      const sg = sigsRef.current[sigsRef.current.length - 1]
      const res = await fetch('/api/indicator-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol, tf, price: cs[cs.length - 1].c, recent,
          signal: sg ? { side: sg.side, status: sg.status, entry: sg.entry, sl: sg.sl, tp1: sg.tp1, tp2: sg.tp2, deltaPct: Math.round(sg.deltaPct), stackedImbalance: sg.stacked } : null,
          news: newsRef.current.slice(0, 8).map(n => `[${ago(n.time)}] ${n.title}`),
        }),
      })
      setAi(await res.json())
      setAiAt(Date.now())
    } catch {
      setAi({ action: 'WAIT', bias: 'NEUTRAL', confidence: 0, newsSentiment: '-', risk: '-', summary: '', points: [], error: 'ហៅ AI មិនបាន' })
    } finally {
      setAiBusy(false)
    }
  }
  runAIRef.current = runAI

  // news (refresh every 3 min)
  useEffect(() => {
    let stop = false
    const load = () =>
      fetch(`/api/indicator-news?symbol=${symbol}`).then(r => r.json()).then(d => {
        if (!stop && Array.isArray(d.items)) { setNews(d.items); newsRef.current = d.items }
      }).catch(() => {})
    load()
    const iv = setInterval(load, 180000)
    return () => { stop = true; clearInterval(iv) }
  }, [symbol])

  // countdown + auto AI 30s before the next candle opens
  useEffect(() => {
    const ms = TF_MS[tf]
    setAi(null); lastAiKey.current = 0; initAi.current = false
    const iv = setInterval(() => {
      const rem = ms - (Date.now() % ms)
      setLeft(rem)
      const key = Math.floor(Date.now() / ms)
      if (rem <= 30000 && lastAiKey.current !== key) { lastAiKey.current = key; runAIRef.current() }
    }, 1000)
    return () => clearInterval(iv)
  }, [tf, symbol])

  // first analysis once live data is in
  useEffect(() => {
    if (status === 'live' && !initAi.current) {
      initAi.current = true
      const t = setTimeout(() => runAIRef.current(), 3000)
      return () => clearTimeout(t)
    }
  }, [status])

  // draw
  useEffect(() => {
    const cv = cvRef.current
    const cs = candles.current
    if (!cv || w < 300 || cs.length < 2) return
    const dpr = window.devicePixelRatio || 1
    const H = 560, AX = 78, FOOT = 34, CH = H - FOOT
    cv.width = w * dpr; cv.height = H * dpr
    cv.style.width = w + 'px'; cv.style.height = H + 'px'
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#0b0e14'; g.fillRect(0, 0, w, H)

    const N = Math.min(VIS, cs.length), start = cs.length - N, vis = cs.slice(start)
    let hi = -Infinity, lo = Infinity
    vis.forEach(c => { hi = Math.max(hi, c.h); lo = Math.min(lo, c.l) })
    const pad = (hi - lo) * 0.1 || tick
    hi += pad; lo -= pad
    let tk = tick
    while (((hi - lo) / tk) * 7 > CH) tk *= 2
    const y = (p: number) => ((hi - p) / (hi - lo)) * CH
    const colW = (w - AX) / N
    const rowH = Math.max(1, (tk / (hi - lo)) * CH)

    // grid + axis
    g.font = '10px monospace'; g.textBaseline = 'middle'
    const step = tk * Math.max(1, Math.round(40 / rowH))
    for (let p = Math.ceil(lo / step) * step; p < hi; p += step) {
      g.strokeStyle = '#1b2230'; g.lineWidth = 1
      g.beginPath(); g.moveTo(0, y(p)); g.lineTo(w - AX, y(p)); g.stroke()
      g.fillStyle = '#6b7690'; g.fillText(p.toFixed(tick < 1 ? 2 : 1), w - AX + 6, y(p))
    }

    // candles
    vis.forEach((c, idx) => {
      const x = idx * colW
      if (c.hasLv && c.lv.size > 0) {
        const groups = new Map<number, Lvl>()
        c.lv.forEach((v, k) => {
          const gk = r8(Math.floor(k / tk) * tk)
          const o = groups.get(gk) || { b: 0, s: 0 }
          o.b += v.b; o.s += v.s
          groups.set(gk, o)
        })
        let mx = 0, poc = 0
        groups.forEach((v, k) => { if (v.b + v.s > mx) { mx = v.b + v.s; poc = k } })
        const im = imbalance(groups, tk)
        groups.forEach((v, k) => {
          const yy = y(k + tk), tot = v.b + v.s, a = 0.15 + 0.6 * (tot / mx)
          g.fillStyle = v.b >= v.s ? `rgba(38,166,154,${a})` : `rgba(239,83,80,${a})`
          g.fillRect(x + 2, yy, colW - 4, rowH - 1)
          if (k === poc) { g.strokeStyle = '#ffd54f'; g.lineWidth = 1.5; g.strokeRect(x + 2, yy, colW - 4, rowH - 1) }
          if (im.buyK.has(k)) { g.fillStyle = '#00e676'; g.fillRect(x + colW - 6, yy, 3, rowH - 1) }
          if (im.sellK.has(k)) { g.fillStyle = '#ff1744'; g.fillRect(x + 3, yy, 3, rowH - 1) }
          if (colW >= 50 && rowH >= 10) {
            g.font = '9px monospace'; g.fillStyle = '#e6e9ef'; g.textAlign = 'center'
            g.fillText(`${fmtQ(v.s)}x${fmtQ(v.b)}`, x + colW / 2, yy + rowH / 2)
            g.textAlign = 'left'
          }
        })
      } else {
        const up = c.c >= c.o
        g.strokeStyle = g.fillStyle = up ? '#26a69a' : '#ef5350'
        g.beginPath(); g.moveTo(x + colW / 2, y(c.h)); g.lineTo(x + colW / 2, y(c.l)); g.stroke()
        g.fillRect(x + colW / 2 - 5, Math.min(y(c.o), y(c.c)), 10, Math.max(1, Math.abs(y(c.o) - y(c.c))))
      }
      const d = c.buy - c.sell
      g.font = '10px monospace'; g.textAlign = 'center'
      g.fillStyle = d >= 0 ? '#26a69a' : '#ef5350'
      g.fillText(`Δ ${d.toFixed(1)}`, x + colW / 2, CH + 12)
      g.fillStyle = '#6b7690'
      g.fillText(`V ${(c.buy + c.sell).toFixed(0)}`, x + colW / 2, CH + 26)
      g.textAlign = 'left'
    })

    // signals
    const lastSig = sigs[sigs.length - 1]
    sigs.forEach(s => {
      if (s.i < start - 2) return
      const x0 = Math.max(0, (s.i - start) * colW)
      const col = s.side === 'BUY' ? '38,166,154' : '239,83,80'
      // marker
      if (s.i >= start) {
        g.fillStyle = `rgb(${col})`
        const mx = x0 + colW / 2, my = s.side === 'BUY' ? y(s.zoneLo) + 10 : y(s.zoneHi) - 10
        g.beginPath()
        if (s.side === 'BUY') { g.moveTo(mx, my - 8); g.lineTo(mx - 6, my + 2); g.lineTo(mx + 6, my + 2) }
        else { g.moveTo(mx, my + 8); g.lineTo(mx - 6, my - 2); g.lineTo(mx + 6, my - 2) }
        g.fill()
      }
      const active = ['PENDING', 'FILLED', 'TP1'].includes(s.status)
      if (!(active || s === lastSig)) return
      // zone
      g.fillStyle = `rgba(${col},0.10)`
      g.fillRect(x0, y(s.zoneHi), w - AX - x0, y(s.zoneLo) - y(s.zoneHi))
      const line = (p: number, color: string, label: string, dash: number[]) => {
        if (p > hi || p < lo) return
        g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = 1.2
        g.beginPath(); g.moveTo(x0, y(p)); g.lineTo(w - AX, y(p)); g.stroke(); g.setLineDash([])
        g.fillStyle = color; g.fillRect(w - AX, y(p) - 8, AX, 16)
        g.fillStyle = '#0b0e14'; g.font = 'bold 10px monospace'
        g.fillText(`${label} ${p.toFixed(tick < 1 ? 2 : 1)}`, w - AX + 3, y(p))
      }
      line(s.entry, '#4aa3ff', s.side === 'BUY' ? 'BUY LMT' : 'SELL LMT', [5, 4])
      line(s.sl, '#ff5252', 'SL', [])
      line(s.tp1, '#66bb6a', 'TP1', [])
      line(s.tp2, '#b2ff59', 'TP2', [])
    })

    // live price
    const last = cs[cs.length - 1]
    g.strokeStyle = '#ffffff55'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, y(last.c)); g.lineTo(w - AX, y(last.c)); g.stroke(); g.setLineDash([])
    g.fillStyle = '#fff'; g.fillRect(w - AX, y(last.c) - 8, AX, 16)
    g.fillStyle = '#000'; g.font = 'bold 10px monospace'; g.fillText(last.c.toFixed(tick < 1 ? 2 : 1), w - AX + 3, y(last.c))
  }, [ver, w, sigs, tick])

  const latest = sigs[sigs.length - 1]
  const activeSig = latest && ['PENDING', 'FILLED'].includes(latest.status) ? latest : null
  let finalCall: { label: string; color: string; note: string } = { label: '⏳ រង់ចាំ', color: '#ffd54f', note: 'មិនទាន់មាន Footprint signal សកម្ម' }
  if (ai && !ai.error) {
    if (activeSig && ai.action === 'TAKE' && ai.bias === activeSig.side)
      finalCall = { label: `✅ ចូល ${activeSig.side}`, color: '#26a69a', note: 'Footprint និង AI/News ស្របគ្នា' }
    else if (activeSig && (ai.action === 'SKIP' || (ai.bias !== 'NEUTRAL' && ai.bias !== activeSig.side)))
      finalCall = { label: '⛔ រំលង', color: '#ef5350', note: 'AI/News ផ្ទុយ ឬមានហានិភ័យ' }
    else if (activeSig)
      finalCall = { label: '⏳ រង់ចាំបញ្ជាក់', color: '#ffd54f', note: 'AI មិនទាន់ជឿជាក់' }
  }
  const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
  const closed = sigs.filter(s => ['TP1', 'TP2', 'SL'].includes(s.status))
  const wins = closed.filter(s => s.status !== 'SL').length
  const fp = (n: number) => n.toFixed(tick < 1 ? 2 : 1)

  const box: React.CSSProperties = { background: '#11151d', border: '1px solid #1f2735', borderRadius: 10, padding: 14 }
  const inp: React.CSSProperties = { background: '#0b0e14', color: '#e6e9ef', border: '1px solid #2a3446', borderRadius: 6, padding: '5px 8px', width: 74 }
  const lab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#8b95ad' }
  const stColor = (s: string) => (s === 'SL' ? '#ef5350' : s === 'TP1' || s === 'TP2' ? '#26a69a' : s === 'FILLED' ? '#4aa3ff' : s === 'PENDING' ? '#ffd54f' : '#6b7690')

  return (
    <div style={{ background: '#080a10', color: '#e6e9ef', minHeight: '100vh', padding: 18, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Order Flow Footprint Indicator</h1>
        <span style={{ fontSize: 12, color: status === 'live' ? '#26a69a' : '#ffd54f' }}>● {status}</span>
      </div>

      <div style={{ ...box, display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <label style={lab}>Symbol
          <select style={inp} value={symbol} onChange={e => { setSymbol(e.target.value); setTick(SYMBOLS[e.target.value]) }}>
            {Object.keys(SYMBOLS).map(s => <option key={s}>{s}</option>)}
          </select></label>
        <label style={lab}>Timeframe
          <select style={inp} value={tf} onChange={e => setTf(e.target.value)}>{Object.keys(TF_MS).map(s => <option key={s}>{s}</option>)}</select></label>
        <label style={lab}>Tick (row)<input style={inp} type="number" step="any" value={tick} onChange={e => setTick(Math.max(0.0001, +e.target.value))} /></label>
        <label style={lab}>Min Delta %<input style={inp} type="number" value={minDelta} onChange={e => setMinDelta(+e.target.value)} /></label>
        <label style={lab}>Vol × Avg<input style={inp} type="number" step="0.1" value={volMult} onChange={e => setVolMult(+e.target.value)} /></label>
        <label style={lab}>SL (× ATR)<input style={inp} type="number" step="0.1" value={slAtr} onChange={e => setSlAtr(+e.target.value)} /></label>
        <label style={lab}>TP1 (R)<input style={inp} type="number" step="0.1" value={tp1R} onChange={e => setTp1R(+e.target.value)} /></label>
        <label style={lab}>TP2 (R)<input style={inp} type="number" step="0.1" value={tp2R} onChange={e => setTp2R(+e.target.value)} /></label>
        <label style={lab}>Pending Entry
          <select style={{ ...inp, width: 120 }} value={entryMode} onChange={e => setEntryMode(e.target.value)}>
            <option value="50">Pullback 50%</option><option value="POC">POC</option><option value="CLOSE">Market close</option>
          </select></label>
      </div>

      <div ref={wrapRef} style={{ ...box, padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <canvas ref={cvRef} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 12, marginBottom: 12 }}>
        <div style={{ ...box, borderColor: finalCall.color }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: '#8b95ad' }}>🤖 AI + News Signal</div>
            <div style={{ fontSize: 12, color: '#8b95ad' }}>Candle ថ្មីក្នុង <b style={{ color: left <= 30000 ? '#ffd54f' : '#e6e9ef' }}>{mmss(left)}</b></div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: finalCall.color }}>{finalCall.label}</div>
          <div style={{ fontSize: 12, color: '#8b95ad', marginBottom: 10 }}>{finalCall.note}</div>
          {aiBusy && <div style={{ color: '#4aa3ff', fontSize: 13 }}>🧠 AI កំពុងគិត (Footprint + ព័ត៌មាន)…</div>}
          {ai?.error && <div style={{ color: '#ef5350', fontSize: 13 }}>{ai.error}</div>}
          {ai && !ai.error && (
            <>
              <div style={{ display: 'flex', gap: 14, fontSize: 13, flexWrap: 'wrap', marginBottom: 8 }}>
                <span>Bias: <b style={{ color: ai.bias === 'BUY' ? '#26a69a' : ai.bias === 'SELL' ? '#ef5350' : '#ffd54f' }}>{ai.bias}</b></span>
                <span>Action: <b>{ai.action}</b></span>
                <span>News: <b>{ai.newsSentiment}</b></span>
                <span>Risk: <b>{ai.risk}</b></span>
              </div>
              <div style={{ height: 6, background: '#1b2230', borderRadius: 3, marginBottom: 4 }}>
                <div style={{ width: `${Math.max(0, Math.min(100, ai.confidence))}%`, height: 6, background: finalCall.color, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 11, color: '#8b95ad', marginBottom: 8 }}>Confidence {ai.confidence}%{aiAt ? ` · ${new Date(aiAt).toLocaleTimeString()}` : ''}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>{ai.summary}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#b7c0d4', lineHeight: 1.7 }}>
                {ai.points?.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </>
          )}
          <button onClick={() => runAI()} disabled={aiBusy} style={{ marginTop: 10, background: '#1a2740', color: '#e6e9ef', border: '1px solid #2a3446', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
            វិភាគឥឡូវនេះ
          </button>
          <div style={{ fontSize: 11, color: '#6b7690', marginTop: 8 }}>AI វិភាគស្វ័យប្រវត្តិ ៣០ វិនាទីមុន candle {tf} ថ្មី។ AI មិនកំណត់តម្លៃ Entry/SL/TP ទេ — Engine គណនា។</div>
        </div>

        <div style={box}>
          <div style={{ fontSize: 13, color: '#8b95ad', marginBottom: 8 }}>📰 ព័ត៌មាន ({symbol.replace('USDT', '')})</div>
          <div style={{ maxHeight: 330, overflow: 'auto' }}>
            {news.length === 0 && <div style={{ color: '#6b7690', fontSize: 12 }}>កំពុងទាញព័ត៌មាន…</div>}
            {news.map((n, k) => (
              <a key={k} href={n.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '7px 0', borderBottom: '1px solid #1b2230', textDecoration: 'none', color: '#e6e9ef' }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.title}</div>
                <div style={{ fontSize: 11, color: '#6b7690', marginTop: 2 }}>
                  {Date.now() - n.time < 3600000 && <span style={{ background: '#ef5350', color: '#fff', borderRadius: 4, padding: '0 5px', marginRight: 6, fontWeight: 700 }}>ថ្មី</span>}
                  📅 {fmtDate(n.time)} · {ago(n.time)} · {n.source}
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        <div style={box}>
          <div style={{ fontSize: 13, color: '#8b95ad', marginBottom: 8 }}>Signal ចុងក្រោយ</div>
          {latest ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: latest.side === 'BUY' ? '#26a69a' : '#ef5350' }}>
                {latest.side} ZONE <span style={{ fontSize: 13, color: stColor(latest.status) }}>[{latest.status}]</span>
              </div>
              <table style={{ width: '100%', marginTop: 8, fontSize: 14, borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td>Zone</td><td style={{ textAlign: 'right' }}>{fp(latest.zoneLo)} – {fp(latest.zoneHi)}</td></tr>
                  <tr><td style={{ color: '#4aa3ff' }}>{latest.side} LIMIT (Pre-order)</td><td style={{ textAlign: 'right' }}>{fp(latest.entry)}</td></tr>
                  <tr><td style={{ color: '#ff5252' }}>Stop Loss</td><td style={{ textAlign: 'right' }}>{fp(latest.sl)}</td></tr>
                  <tr><td style={{ color: '#66bb6a' }}>TP1</td><td style={{ textAlign: 'right' }}>{fp(latest.tp1)}</td></tr>
                  <tr><td style={{ color: '#b2ff59' }}>TP2</td><td style={{ textAlign: 'right' }}>{fp(latest.tp2)}</td></tr>
                  <tr><td>Delta / Stacked Imb.</td><td style={{ textAlign: 'right' }}>{latest.deltaPct.toFixed(0)}% / {latest.stacked || '–'}</td></tr>
                </tbody>
              </table>
            </>
          ) : <div style={{ color: '#6b7690' }}>កំពុងរង់ចាំ signal…</div>}
        </div>

        <div style={box}>
          <div style={{ fontSize: 13, color: '#8b95ad', marginBottom: 8 }}>
            ប្រវត្តិ Signal · ឈ្នះ {wins}/{closed.length}{closed.length ? ` (${Math.round((wins / closed.length) * 100)}%)` : ''}
          </div>
          <div style={{ maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
            {[...sigs].reverse().slice(0, 25).map((s, k) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1b2230' }}>
                <span style={{ color: s.side === 'BUY' ? '#26a69a' : '#ef5350' }}>{s.side}</span>
                <span>{new Date(s.time).toLocaleTimeString()}</span>
                <span>@{fp(s.entry)}</span>
                <span style={{ color: stColor(s.status) }}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#6b7690', marginTop: 12, lineHeight: 1.6 }}>
        ក្នុង Footprint៖ ក្រឡានីមួយៗ = Sell x Buy (aggressor ពិតពី Binance aggTrade) · ស៊ុមលឿង = POC · បន្ទះបៀបបៀង/ក្រហមតាមគែម = Imbalance ≥ 3×។
        Candle ប្រវត្តិមុនពេលបើកទំព័រមាន Delta តែមិនមាន Level ទេ។ នេះជាឧបករណ៍ជំនួយវិភាគ មិនមែនការណែនាំវិនិយោគ — សូម Paper trade មុន។
      </p>
    </div>
  )
}

