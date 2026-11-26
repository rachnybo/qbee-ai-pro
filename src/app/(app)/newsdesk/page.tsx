"use client";
import { useEffect, useRef, useState } from "react";

type Ev = { id: string; title: string; date: string; impact: string; forecast: string; previous: string };

const SYMBOLS = ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY"];
const ACTION: Record<string, { text: string; cls: string }> = {
  NO_NEW_TRADES: { text: "🚫 កុំបើក trade ថ្មី (ពិចារណាបិទ/កាត់បន្ថយ trade ដែលកំពុងបើក)", cls: "border-rose-500/30 bg-rose-500/10 text-rose-200" },
  PENDING_ORDERS: { text: "⚠️ អាចដាក់ Pending order តែប្រថុយខ្ពស់ (spread និង slippage)", cls: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  WAIT_FOR_RETEST: { text: "⏳ រង់ចាំតម្លៃឡើងចុះដំបូង រួច Retest ទើបចូល", cls: "border-primary/30 bg-primary/5 text-foreground" },
};
const SCEN: { key: string; label: string; sub: string }[] = [
  { key: "beat", label: "BEAT", sub: "លទ្ធផលល្អជាងរំពឹង" },
  { key: "miss", label: "MISS", sub: "លទ្ធផលអាក្រក់ជាងរំពឹង" },
  { key: "inline", label: "INLINE", sub: "ស្មើនឹងរំពឹង" },
];

const badgeCls = (d: string) =>
  d === "BUY"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
    : d === "SELL"
    ? "border-rose-500/30 bg-rose-500/15 text-rose-400"
    : "border-amber-500/30 bg-amber-500/15 text-amber-400";

const fmt = (n: any) => (typeof n === "number" ? (Math.abs(n) >= 100 ? n.toFixed(2) : n.toFixed(5)) : "-");
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function clock(ms: number) {
  if (ms <= 0) return "ចេញព័ត៌មានហើយ";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

function Cell({ label, value, tone = "" }: { label: string; value: any; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export default function NewsDeskPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [evError, setEvError] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [symbol, setSymbol] = useState("XAU/USD");
  const [impact, setImpact] = useState<"high" | "all">("high");
  const [auto, setAuto] = useState(true);
  const [an, setAn] = useState<{ id: string; loading: boolean; data?: any; error?: string } | null>(null);
  const [perm, setPerm] = useState("");
  const lastAuto = useRef("");

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    return () => clearInterval(id);
  }, []);

  async function loadEvents() {
    try {
      const res = await fetch(`/api/news-events?impact=${impact}`);
      const raw = await res.text();
      let j: any;
      try { j = JSON.parse(raw); } catch { throw new Error(`Server ${res.status}: ${raw.slice(0, 160)}`); }
      if (!res.ok) throw new Error(j.error || "Request failed");
      setEvents(j.events);
      setEvError("");
    } catch (e: any) {
      setEvError(e.message);
    }
  }
  useEffect(() => {
    loadEvents();
    const id = setInterval(loadEvents, 300000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [impact]);

  const upcoming = now == null ? [] : events.filter((e) => Date.parse(e.date) - now > -30 * 60000);
  const next = now == null ? undefined : events.find((e) => Date.parse(e.date) - now > -120000);

  function notify(title: string, body: string) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body });
    } catch {}
  }

  async function analyze(ev: Ev) {
    setAn({ id: ev.id, loading: true });
    try {
      const res = await fetch("/api/news-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, event: ev }),
      });
      const raw = await res.text();
      let j: any;
      try { j = JSON.parse(raw); } catch { throw new Error(`Server ${res.status}: ${raw.slice(0, 200)}`); }
      if (!res.ok) throw new Error(j.error || "Request failed");
      setAn({ id: ev.id, loading: false, data: j });
      notify("📊 វិភាគព័ត៌មានរួចរាល់", ev.title);
    } catch (e: any) {
      setAn({ id: ev.id, loading: false, error: e.message });
    }
  }

  // Auto-run once per event when it is 5 minutes (or less) away
  useEffect(() => {
    if (!auto || now == null || !next || an?.loading) return;
    const mins = (Date.parse(next.date) - now) / 60000;
    if (mins <= 5.5 && mins > -2 && lastAuto.current !== next.id) {
      lastAuto.current = next.id;
      notify("⏰ ព័ត៌មានធំនៅ 5 នាទីទៀត", `${next.title} · AI កំពុងវិភាគ`);
      analyze(next);
    }
    // eslint-disable-next-line
  }, [now, next, auto]);

  async function askPermission() {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  }

  const msNext = now != null && next ? Date.parse(next.date) - now : null;
  const phase =
    msNext == null ? "" : msNext <= 0 ? "ចេញព័ត៌មានហើយ" : msNext <= 5 * 60000 ? "🔔 T-5 នាទី · ត្រៀម/វិភាគ" : msNext <= 10 * 60000 ? "ជិតដល់ហើយ" : "រង់ចាំ";
  const a = an?.data?.analysis;
  const pill = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-1 sm:p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          News <span className="text-primary">Signal</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ព័ត៌មាន USD ដែលប៉ះពាល់មាសខ្លាំង៖ AI វិភាគ 5 នាទីមុនចេញព័ត៌មាន (ស្ថានភាពបច្ចុប្បន្ន + ករណី BEAT / MISS / INLINE)។ ទំព័រត្រូវបើកទុក ដើម្បីឲ្យវិភាគស្វ័យប្រវត្តិ។
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
          {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="flex gap-1">
          <button onClick={() => setImpact("high")} className={pill(impact === "high")}>High</button>
          <button onClick={() => setImpact("all")} className={pill(impact === "all")}>High + Medium</button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[oklch(0.8_0.15_85)]" />
          វិភាគស្វ័យប្រវត្តិ T-5 នាទី
        </label>
        {perm !== "granted" && perm !== "denied" && perm !== "" && (
          <button onClick={askPermission} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">🔔 បើកការជូនដំណឹង</button>
        )}
        {perm === "granted" && <span className="text-xs text-emerald-400">🔔 ការជូនដំណឹងបើក</span>}
      </div>

      {evError && <div className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{evError}</div>}

      {next && msNext != null && (
        <div className="rounded-2xl border border-primary/30 bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">ព័ត៌មានបន្ទាប់ · {next.impact}</div>
              <div className="mt-1 text-xl font-semibold">{next.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {when(next.date)} · Forecast {next.forecast || "-"} · Previous {next.previous || "-"}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-4xl font-bold tabular-nums ${msNext <= 5 * 60000 && msNext > 0 ? "text-rose-400" : "text-primary"}`}>{clock(msNext)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{phase}</div>
            </div>
          </div>
          <button
            onClick={() => analyze(next)}
            disabled={an?.loading}
            className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {an?.loading ? "AI កំពុងវិភាគ..." : "វិភាគឥឡូវនេះ"}
          </button>
        </div>
      )}

      {!next && !evError && now != null && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">មិនមានព័ត៌មាន USD ដែលនៅសល់ក្នុងសប្តាហ៍នេះទេ។</div>
      )}

      {an?.loading && (
        <div className="animate-pulse rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          AI កំពុងវិភាគ (Indicators + Order Flow + ព័ត៌មាន)... សូមរង់ចាំ 30–100 វិនាទី
        </div>
      )}
      {an?.error && <div className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{an.error}</div>}

      {a && (
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">របាយការណ៍មុនព័ត៌មាន</div>
              <div className="mt-1 text-lg font-semibold">{an?.data?.event?.title}</div>
            </div>
            <div className="text-xs text-muted-foreground">វិភាគនៅ T{an.data.meta.minutesAtAnalysis >= 0 ? "-" : "+"}{Math.abs(an.data.meta.minutesAtAnalysis)} នាទី · Confidence {a.confidence}%</div>
          </div>

          <div className={`rounded-lg border p-3 text-sm ${ACTION[a.preNewsAction]?.cls}`}>
            <b>{ACTION[a.preNewsAction]?.text}</b>
            {a.preNewsNote ? <div className="mt-1 text-xs opacity-90">{a.preNewsNote}</div> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/40 p-3 text-sm"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">ហេតុអ្វីសំខាន់</div>{a.whyItMatters}</div>
            <div className="rounded-lg border border-border bg-background/40 p-3 text-sm"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">BEAT / MISS មានន័យអ្វី</div>{a.beatMeans}</div>
            <div className="rounded-lg border border-border bg-background/40 p-3 text-sm"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">ស្ថានភាព Technical</div>{a.technicalPicture}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {SCEN.map((s) => {
              const sc = a.scenarios?.[s.key] || {};
              return (
                <div key={s.key} className="flex flex-col gap-3 rounded-xl border border-border bg-background/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">{s.sub}</div>
                    </div>
                    <div className={`rounded-lg border px-3 py-1 text-sm font-bold ${badgeCls(sc.direction)}`}>{sc.direction}</div>
                  </div>
                  <div className="text-xs leading-relaxed"><b>មាសប្រតិកម្ម៖ </b>{sc.goldReaction}</div>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs"><b className="text-primary">🎯 លក្ខខណ្ឌចូល៖ </b>{sc.trigger}</div>
                  {sc.direction !== "NO TRADE" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Cell label="Entry" value={fmt(sc.entry)} />
                      <Cell label="SL" value={fmt(sc.sl)} tone="text-rose-400" />
                      <Cell label="TP1" value={fmt(sc.tp1)} tone="text-emerald-400" />
                      <Cell label="TP2" value={fmt(sc.tp2)} tone="text-emerald-400" />
                      <Cell label="R : R" value={sc.rr ?? "-"} tone="text-primary" />
                    </div>
                  )}
                  {Array.isArray(sc.warnings) && sc.warnings.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-rose-500/25 bg-rose-500/10 p-2 text-xs text-rose-200">
                      {sc.warnings.map((w: string, i: number) => <div key={i}>⚠ {w}</div>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {a.levels && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">កម្រិតខាងលើ (Resistance / Liquidity)</div>
                <div className="flex flex-wrap gap-2">
                  {(a.levels.above || []).map((n: number, i: number) => <span key={i} className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs tabular-nums text-rose-400">{fmt(n)}</span>)}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">កម្រិតខាងក្រោម (Support / Liquidity)</div>
                <div className="flex flex-wrap gap-2">
                  {(a.levels.below || []).map((n: number, i: number) => <span key={i} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs tabular-nums text-emerald-400">{fmt(n)}</span>)}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200/90">
            <div className="mb-1 font-semibold">⚠ ហានិភ័យ</div>
            <ul className="list-disc space-y-1 pl-5">
              {(a.riskNotes || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
            <div className="mt-2 text-xs">📏 ទំហំ trade៖ {a.sizeAdvice} · ⏱ រង់ចាំ {a.waitMinutesAfter} នាទី ក្រោយចេញព័ត៌មាន</div>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-0.5">🤖 {an.data.meta.model}</span>
            <span className="rounded-md border border-border px-2 py-0.5">⏱ {an.data.meta.seconds}s</span>
            <span className="rounded-md border border-border px-2 py-0.5">តម្លៃ {fmt(an.data.meta.price)}</span>
            <span className="rounded-md border border-border px-2 py-0.5">ATR M5 {fmt(an.data.meta.atr)}</span>
            <span className="rounded-md border border-border px-2 py-0.5">{an.data.meta.orderFlow ? "✅ Order Flow" : "— Order Flow"}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            AI មិនដឹងលទ្ធផលព័ត៌មានទេ នេះគឺជាផែនការតាមលក្ខខណ្ឌប៉ុណ្ណោះ។ ការ trade ព័ត៌មានមានហានិភ័យខ្ពស់ (spread ធំ, slippage, តម្លៃលោតទៅមក) ហើយមិនមែនជាដំបូន្មានវិនិយោគទេ។ សូមតេស្តលើ demo ជាមុន ហើយប្រថុយតិចជាងធម្មតា។
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">📅 ព័ត៌មាន USD ដែលនៅសល់ (ម៉ោង GMT+7)</div>
        {upcoming.length === 0 ? (
          <div className="text-sm text-muted-foreground">មិនមានទិន្នន័យ</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-2">ម៉ោង</th><th>ព័ត៌មាន</th><th>Impact</th><th>Forecast</th><th>Previous</th><th></th></tr>
              </thead>
              <tbody>
                {upcoming.slice(0, 14).map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="py-2 text-xs text-muted-foreground">{when(e.date)}</td>
                    <td className="font-medium">{e.title}</td>
                    <td><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.impact === "High" ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400"}`}>{e.impact}</span></td>
                    <td>{e.forecast || "-"}</td>
                    <td>{e.previous || "-"}</td>
                    <td className="text-right"><button onClick={() => analyze(e)} disabled={an?.loading} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-50">វិភាគ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
