"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Dir = "BUY" | "SELL";
type Trade = {
  id: string; date: string; symbol: string; dir: Dir;
  entry: number; sl: number | null; tp: number | null; exit: number | null;
  lots: number | null; pnl: number | null;
  setup: string; quality: string; notes: string;
};
type Form = {
  date: string; symbol: string; customSymbol: string; dir: Dir;
  entry: string; sl: string; tp: string; exit: string; lots: string; pnl: string;
  setup: string; quality: string; notes: string;
};

const KEY = "ict-journal-v1";
const SYMBOLS = ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "BTC/USD", "ETH/USD", "NAS100", "US30", "Other"];
const SETUPS = ["Order Flow Zone", "BOS + Retest", "AI Analyze", "Breakout", "Reversal", "News", "Other"];
const QUALITY = ["✅ តាមផែនការ", "FOMO", "Revenge trade", "ចូលយឺត / ភ័យ", "រុញ SL", "ចេញលឿនពេក"];

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const emptyForm = (): Form => ({
  date: nowLocal(), symbol: "XAU/USD", customSymbol: "", dir: "BUY",
  entry: "", sl: "", tp: "", exit: "", lots: "", pnl: "",
  setup: SETUPS[0], quality: QUALITY[0], notes: "",
});
const num = (s: string) => {
  const v = parseFloat(s);
  return isFinite(v) ? v : null;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function rOf(t: Trade): number | null {
  if (t.exit == null || t.sl == null) return null;
  const risk = Math.abs(t.entry - t.sl);
  if (risk === 0) return null;
  const gain = t.dir === "BUY" ? t.exit - t.entry : t.entry - t.exit;
  return gain / risk;
}
const isClosed = (t: Trade) => t.exit != null || t.pnl != null;
const fmt = (n: number | null, d = 2) => (n == null ? "-" : n.toFixed(d));
const sgn = (n: number) => (n > 0 ? "+" : "") + n.toFixed(2);

function Equity({ pts, unit }: { pts: number[]; unit: string }) {
  if (pts.length < 2)
    return <div className="py-10 text-center text-sm text-muted-foreground">ត្រូវការយ៉ាងតិច 2 trade ដែលបានបិទ ដើម្បីបង្ហាញក្រាហ្វ</div>;
  const W = 600, H = 170, P = 12;
  const all = [0, ...pts];
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (all.length - 1);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const d = all.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(all.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const up = all[all.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-44 w-full ${up ? "text-emerald-400" : "text-rose-400"}`} preserveAspectRatio="none">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="4 4" />
      <path d={area} fill="currentColor" fillOpacity="0.12" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <text x={W - P} y={14} textAnchor="end" fontSize="11" fill="currentColor">{sgn(all[all.length - 1])}{unit}</text>
    </svg>
  );
}

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState<Form>(emptyForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [fSym, setFSym] = useState("ALL");
  const [fPeriod, setFPeriod] = useState("ALL");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setTrades(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify(trades)); } catch {}
  }, [trades, loaded]);

  const set = (k: keyof Form, v: string) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    const entry = num(f.entry);
    const symbol = f.symbol === "Other" ? f.customSymbol.trim().toUpperCase() : f.symbol;
    if (entry == null) return setMsg("សូមបញ្ចូលតម្លៃ Entry");
    if (!symbol) return setMsg("សូមបញ្ចូលឈ្មោះ Symbol");
    const t: Trade = {
      id: editing ?? uid(), date: f.date || nowLocal(), symbol, dir: f.dir, entry,
      sl: num(f.sl), tp: num(f.tp), exit: num(f.exit), lots: num(f.lots), pnl: num(f.pnl),
      setup: f.setup, quality: f.quality, notes: f.notes.trim(),
    };
    setTrades((p) => (editing ? p.map((x) => (x.id === editing ? t : x)) : [t, ...p]));
    setF({ ...emptyForm(), symbol: f.symbol, customSymbol: f.customSymbol, setup: f.setup });
    setEditing(null);
    setMsg(editing ? "បានកែប្រែ ✅" : "បានរក្សាទុក ✅");
    setTimeout(() => setMsg(""), 2500);
  }

  function edit(t: Trade) {
    const known = SYMBOLS.includes(t.symbol);
    setF({
      date: t.date, symbol: known ? t.symbol : "Other", customSymbol: known ? "" : t.symbol, dir: t.dir,
      entry: String(t.entry), sl: t.sl == null ? "" : String(t.sl), tp: t.tp == null ? "" : String(t.tp),
      exit: t.exit == null ? "" : String(t.exit), lots: t.lots == null ? "" : String(t.lots),
      pnl: t.pnl == null ? "" : String(t.pnl), setup: t.setup, quality: t.quality, notes: t.notes,
    });
    setEditing(t.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function remove(id: string) {
    if (confirm("លុប trade នេះ?")) setTrades((p) => p.filter((x) => x.id !== id));
  }

  function download(name: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function exportCsv() {
    const head = ["date", "symbol", "dir", "entry", "sl", "tp", "exit", "lots", "pnl", "R", "setup", "quality", "notes"];
    const q = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = trades.map((t) => [t.date, t.symbol, t.dir, t.entry, t.sl, t.tp, t.exit, t.lots, t.pnl, rOf(t)?.toFixed(2) ?? "", t.setup, t.quality, t.notes].map(q).join(","));
    download("trade-journal.csv", [head.join(","), ...rows].join("\n"), "text/csv");
  }
  function exportJson() {
    download("trade-journal-backup.json", JSON.stringify(trades, null, 2), "application/json");
  }
  function importJson(file?: File | null) {
    if (!file) return;
    file.text().then((txt) => {
      try {
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error();
        const ok = arr.filter((t: any) => t && typeof t.entry === "number" && t.symbol && t.dir);
        setTrades((p) => {
          const ids = new Set(p.map((x) => x.id));
          return [...p, ...ok.filter((t: Trade) => !ids.has(t.id))];
        });
        setMsg(`បាននាំចូល ${ok.length} trade ✅`);
      } catch {
        setMsg("ឯកសារ JSON មិនត្រឹមត្រូវ");
      }
      setTimeout(() => setMsg(""), 3000);
    });
  }

  const symbolsUsed = useMemo(() => Array.from(new Set(trades.map((t) => t.symbol))), [trades]);
  const list = useMemo(() => {
    const days = fPeriod === "7" ? 7 : fPeriod === "30" ? 30 : 0;
    const from = days ? Date.now() - days * 864e5 : 0;
    return trades
      .filter((t) => (fSym === "ALL" || t.symbol === fSym) && (!days || new Date(t.date).getTime() >= from))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [trades, fSym, fPeriod]);

  const st = useMemo(() => {
    const closed = list.filter(isClosed).sort((a, b) => (a.date < b.date ? -1 : 1));
    const useR = closed.some((t) => rOf(t) != null);
    const rows = closed
      .map((t) => ({ t, v: useR ? rOf(t) : t.pnl }))
      .filter((x): x is { t: Trade; v: number } => x.v != null);
    const wins = rows.filter((x) => x.v > 0);
    const losses = rows.filter((x) => x.v < 0);
    const net = rows.reduce((s, x) => s + x.v, 0);
    const gp = wins.reduce((s, x) => s + x.v, 0);
    const gl = Math.abs(losses.reduce((s, x) => s + x.v, 0));
    let run = 0, peak = 0, dd = 0;
    const curve = rows.map((x) => { run += x.v; peak = Math.max(peak, run); dd = Math.max(dd, peak - run); return run; });
    let streak = 0, streakWin = true;
    for (let i = rows.length - 1; i >= 0; i--) {
      const w = rows[i].v > 0;
      if (i === rows.length - 1) { streakWin = w; streak = 1; } else if (w === streakWin && rows[i].v !== 0) streak++; else break;
    }
    const bySetup: Record<string, { n: number; w: number; net: number }> = {};
    rows.forEach((x) => {
      const b = (bySetup[x.t.setup] ||= { n: 0, w: 0, net: 0 });
      b.n++; if (x.v > 0) b.w++; b.net += x.v;
    });
    const plan = rows.filter((x) => x.t.quality.startsWith("✅"));
    const off = rows.filter((x) => !x.t.quality.startsWith("✅"));
    const avg = (a: { v: number }[]) => (a.length ? a.reduce((s, x) => s + x.v, 0) / a.length : null);
    const pnlTotal = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    return {
      useR, n: rows.length, wins: wins.length, losses: losses.length,
      winRate: wins.length + losses.length ? Math.round((wins.length / (wins.length + losses.length)) * 100) : 0,
      net, avg: rows.length ? net / rows.length : 0,
      pf: gl ? gp / gl : gp > 0 ? Infinity : 0,
      best: rows.length ? Math.max(...rows.map((x) => x.v)) : 0,
      worst: rows.length ? Math.min(...rows.map((x) => x.v)) : 0,
      dd, curve, streak, streakWin, bySetup, avgPlan: avg(plan), avgOff: avg(off), nPlan: plan.length, nOff: off.length,
      open: list.filter((t) => !isClosed(t)).length, pnlTotal,
    };
  }, [list]);

  const unit = st.useR ? "R" : "$";
  const inp = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const lbl = "mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground";
  const card = "rounded-lg border border-border bg-background/40 p-3";
  const cap = "text-[10px] uppercase tracking-wider text-muted-foreground";
  const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "");
  const btn = "rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Trade <span className="text-primary">Journal</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">កត់ត្រារាល់ trade ដើម្បីដឹងថា Setup ណា និងអាកប្បកិរិយាណា ធ្វើឲ្យអ្នកចាញ់ ឬឈ្នះ</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={fSym} onChange={(e) => setFSym(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
            <option value="ALL">Symbol ទាំងអស់</option>
            {symbolsUsed.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
            <option value="ALL">គ្រប់ពេល</option>
            <option value="7">7 ថ្ងៃ</option>
            <option value="30">30 ថ្ងៃ</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className={card}><div className={cap}>Trades</div><b className="text-lg">{st.n}</b></div>
        <div className={card}><div className={cap}>Win rate</div><b className="text-lg text-primary">{st.winRate}%</b></div>
        <div className={card}><div className={cap}>Net {unit}</div><b className={`text-lg tabular-nums ${tone(st.net)}`}>{sgn(st.net)}</b></div>
        <div className={card}><div className={cap}>Avg / trade</div><b className={`text-lg tabular-nums ${tone(st.avg)}`}>{sgn(st.avg)}</b></div>
        <div className={card}><div className={cap}>Profit factor</div><b className="text-lg tabular-nums">{st.pf === Infinity ? "∞" : st.pf.toFixed(2)}</b></div>
        <div className={card}><div className={cap}>Max drawdown</div><b className="text-lg tabular-nums text-rose-400">-{st.dd.toFixed(2)}</b></div>
        <div className={card}><div className={cap}>Streak</div><b className={`text-lg ${st.streakWin ? "text-emerald-400" : "text-rose-400"}`}>{st.n ? `${st.streak}${st.streakWin ? "W" : "L"}` : "-"}</b></div>
        <div className={card}><div className={cap}>P/L ($)</div><b className={`text-lg tabular-nums ${tone(st.pnlTotal)}`}>{sgn(st.pnlTotal)}</b></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-semibold">📈 Equity curve ({unit})</div>
              <div className="text-xs text-muted-foreground">Best {sgn(st.best)} · Worst {sgn(st.worst)}</div>
            </div>
            <Equity pts={st.curve} unit={unit} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">📒 បញ្ជី Trade ({list.length}{st.open ? ` · បើក ${st.open}` : ""})</div>
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={exportCsv} disabled={!trades.length}>⬇ CSV</button>
                <button className={btn} onClick={exportJson} disabled={!trades.length}>💾 Backup</button>
                <button className={btn} onClick={() => importRef.current?.click()}>📂 Import</button>
                <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            </div>
            {list.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">មិនទាន់មាន trade ទេ។ បញ្ចូល trade ដំបូងនៅខាងស្តាំ។</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-2">ពេល</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>SL</th><th>TP</th><th>Exit</th><th>R</th><th>$</th><th>Setup</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((t) => {
                      const r = rOf(t);
                      const v = r ?? t.pnl;
                      return (
                        <tr key={t.id} className="border-t border-border align-top">
                          <td className="whitespace-nowrap py-2 text-xs text-muted-foreground">{t.date.replace("T", " ")}</td>
                          <td className="font-medium">{t.symbol}</td>
                          <td className={t.dir === "BUY" ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>{t.dir}</td>
                          <td>{fmt(t.entry, 2)}</td>
                          <td className="text-rose-400">{fmt(t.sl, 2)}</td>
                          <td className="text-emerald-400">{fmt(t.tp, 2)}</td>
                          <td>{isClosed(t) ? fmt(t.exit, 2) : <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">OPEN</span>}</td>
                          <td className={`font-semibold ${v == null ? "" : tone(v)}`}>{r == null ? "-" : sgn(r)}</td>
                          <td className={t.pnl == null ? "" : tone(t.pnl)}>{t.pnl == null ? "-" : sgn(t.pnl)}</td>
                          <td className="text-xs">
                            {t.setup}
                            <div className="text-[10px] text-muted-foreground">{t.quality}{t.notes ? " · 📝" : ""}</div>
                            {t.notes && <div className="mt-1 max-w-[220px] whitespace-pre-wrap text-[11px] text-muted-foreground">{t.notes}</div>}
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button className="px-1 text-muted-foreground hover:text-primary" onClick={() => edit(t)} title="កែ">✎</button>
                            <button className="px-1 text-muted-foreground hover:text-rose-400" onClick={() => remove(t.id)} title="លុប">🗑</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/30 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">{editing ? "✎ កែ Trade" : "➕ Trade ថ្មី"}</div>
              {editing && (
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setEditing(null); setF(emptyForm()); }}>បោះបង់</button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>ពេលវេលា</label>
                <input type="datetime-local" value={f.date} onChange={(e) => set("date", e.target.value)} className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Symbol</label>
                  <select value={f.symbol} onChange={(e) => set("symbol", e.target.value)} className={inp}>
                    {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>ទិស</label>
                  <div className="grid grid-cols-2 gap-1">
                    {(["BUY", "SELL"] as Dir[]).map((d) => (
                      <button key={d} type="button" onClick={() => set("dir", d)}
                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                          f.dir === d
                            ? d === "BUY" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400" : "border-rose-500/40 bg-rose-500/15 text-rose-400"
                            : "border-border text-muted-foreground"}`}>{d}</button>
                    ))}
                  </div>
                </div>
              </div>
              {f.symbol === "Other" && (
                <input placeholder="ឈ្មោះ Symbol" value={f.customSymbol} onChange={(e) => set("customSymbol", e.target.value)} className={inp} />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Entry *</label><input inputMode="decimal" value={f.entry} onChange={(e) => set("entry", e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Stop Loss</label><input inputMode="decimal" value={f.sl} onChange={(e) => set("sl", e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Take Profit</label><input inputMode="decimal" value={f.tp} onChange={(e) => set("tp", e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Exit (ទុកទទេ = OPEN)</label><input inputMode="decimal" value={f.exit} onChange={(e) => set("exit", e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Lot</label><input inputMode="decimal" value={f.lots} onChange={(e) => set("lots", e.target.value)} className={inp} /></div>
                <div><label className={lbl}>P/L ($) ស្រេចចិត្ត</label><input inputMode="decimal" value={f.pnl} onChange={(e) => set("pnl", e.target.value)} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Setup</label>
                  <select value={f.setup} onChange={(e) => set("setup", e.target.value)} className={inp}>
                    {SETUPS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>គុណភាពការ trade</label>
                  <select value={f.quality} onChange={(e) => set("quality", e.target.value)} className={inp}>
                    {QUALITY.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>កំណត់ត្រា / មេរៀន</label>
                <textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inp} placeholder="ហេតុអ្វីចូល? ហេតុអ្វីចេញ? ធ្វើអ្វីល្អ/ខុស?" />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ដាក់ SL និង Exit ដើម្បីឲ្យប្រព័ន្ធគណនា <b>R</b> ដោយស្វ័យប្រវត្តិ (1R = ចម្ងាយ Entry ដល់ SL)។
              </p>
              <button onClick={save} className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground transition hover:opacity-90">
                {editing ? "រក្សាទុកការកែ" : "រក្សាទុក Trade"}
              </button>
              {msg && <div className="text-center text-sm text-primary">{msg}</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">🎯 តាម Setup</div>
            {Object.keys(st.bySetup).length === 0 ? (
              <div className="text-sm text-muted-foreground">មិនទាន់មានទិន្នន័យ</div>
            ) : (
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="py-1">Setup</th><th>Trades</th><th>Win%</th><th>Net {unit}</th></tr>
                </thead>
                <tbody>
                  {Object.entries(st.bySetup).sort((a, b) => b[1].net - a[1].net).map(([k, v]) => (
                    <tr key={k} className="border-t border-border">
                      <td className="py-1.5">{k}</td><td>{v.n}</td><td>{Math.round((v.w / v.n) * 100)}%</td>
                      <td className={tone(v.net)}>{sgn(v.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-2 text-sm font-semibold text-primary">🧠 វិន័យ (Discipline)</div>
            {st.avgPlan != null && st.avgOff != null ? (
              <div className="space-y-1 text-sm">
                <div>✅ តាមផែនការ ({st.nPlan}): <b className={tone(st.avgPlan)}>{sgn(st.avgPlan)} {unit}</b> / trade</div>
                <div>⚠ មិនតាមផែនការ ({st.nOff}): <b className={tone(st.avgOff)}>{sgn(st.avgOff)} {unit}</b> / trade</div>
                <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
                  {st.avgPlan > st.avgOff ? "ការតាមផែនការផ្តល់លទ្ធផលល្អជាង។ ការកាត់បន្ថយ trade ខុសវិន័យជាវិធីលឿនបំផុតដើម្បីកែលម្អ។" : "ទិន្នន័យមិនទាន់បង្ហាញថាការតាមផែនការល្អជាងទេ។ ត្រូវការ trade ច្រើនជាងនេះ ឬពិនិត្យផែនការឡើងវិញ។"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ត្រូវការ trade ទាំង "តាមផែនការ" និង "មិនតាមផែនការ" ដើម្បីប្រៀបធៀប។</p>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            ទិន្នន័យរក្សាទុកក្នុង browser នេះ (localhost:3000) ប៉ុណ្ណោះ។ ប្រសិនបើលុប browser data ឬប្តូរ browser/port វានឹងបាត់ ដូច្នេះសូមចុច 💾 Backup ជាប្រចាំ។
          </p>
        </div>
      </div>
    </div>
  );
}
