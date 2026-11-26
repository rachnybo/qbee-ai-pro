"use client";
import { useState } from "react";

const MODES = [
  { id: "scalp", icon: "⚡", label: "Scalping", hint: "H1 · M15 · M5" },
  { id: "day", icon: "📅", label: "Daily", hint: "H4 · H1 · M15" },
  { id: "swing", icon: "🌊", label: "Swing", hint: "W1 · D1 · H4" },
];
const SYMBOLS = ["XAU/USD", "EUR/USD", "GBP/USD", "BTC/USD", "ETH/USD", "NAS100", "US30"];
const ICON: Record<string, string> = { claude: "🟠", openai: "🟢", gemini: "🔵" };

const badgeCls = (d: string) =>
  d === "BUY"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
    : d === "SELL"
    ? "border-rose-500/30 bg-rose-500/15 text-rose-400"
    : "border-amber-500/30 bg-amber-500/15 text-amber-400";

async function postJson(url: string, body: any) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const raw = await res.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Server ${res.status}: ${raw.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

const fmt = (n: any) => (typeof n === "number" ? (Math.abs(n) >= 100 ? n.toFixed(2) : n.toFixed(5)) : "-");

function Cell({ label, value, tone = "" }: { label: string; value: any; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function AiCard({ r }: { r: any }) {
  const a = r.analysis;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{ICON[r.id]} {r.label}</div>
          <div className="text-[11px] text-muted-foreground break-all">{r.model} · {r.seconds}s</div>
        </div>
        {r.ok && (
          <div className={`rounded-lg border px-3 py-1 text-sm font-bold ${badgeCls(a.direction)}`}>{a.direction}</div>
        )}
      </div>

      {!r.ok ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 break-words">
          ❌ {r.error}
        </div>
      ) : (
        <>
          <div className="text-sm font-medium leading-snug">{a.setup}</div>
          <div className="text-xs text-muted-foreground">Bias {a.bias} · Confidence {a.confidence}%</div>
          {a.direction !== "NO TRADE" && (
            <div className="grid grid-cols-2 gap-2">
              <Cell label="Entry" value={fmt(a.entry)} />
              <Cell label="SL" value={fmt(a.sl)} tone="text-rose-400" />
              <Cell label="TP1" value={fmt(a.tp1)} tone="text-emerald-400" />
              <Cell label="TP2" value={fmt(a.tp2)} tone="text-emerald-400" />
            </div>
          )}
          {a.waitFor ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
              <b className="text-primary">⏳ រង់ចាំ: </b>{a.waitFor}
            </div>
          ) : null}
          <ul className="space-y-1.5 text-xs leading-relaxed">
            {(a.reasoning || []).slice(0, 3).map((t: string, i: number) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          {Array.isArray(a.warnings) && a.warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-rose-500/25 bg-rose-500/10 p-2 text-xs text-rose-200">
              {a.warnings.map((w: string, i: number) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CouncilPage() {
  const [mode, setMode] = useState("scalp");
  const [symbol, setSymbol] = useState("XAU/USD");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true); setError(""); setData(null);
    try {
      setData(await postJson("/api/council", { symbol, mode }));
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  const c = data?.consensus;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-1 sm:p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          AI <span className="text-primary">Council</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Claude · ChatGPT · Gemini វិភាគទិន្នន័យដូចគ្នា (Indicators + Order Flow + News) ហើយបោះឆ្នោតទិស។ បើ AI ខ្វែងគ្នា ជាសញ្ញាមិនគួរ trade។
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-xl border p-3 text-left transition ${
              mode === m.id ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/40"
            }`}
          >
            <div className="text-lg">{m.icon}</div>
            <div className="mt-1 text-sm font-semibold">{m.label}</div>
            <div className="text-[11px] text-muted-foreground">{m.hint}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">Symbol</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "AI ទាំង 3 កំពុងវិភាគ..." : "សួរ AI ទាំង 3"}
        </button>
      </div>

      {loading && (
        <div className="animate-pulse rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          កំពុងសួរ Claude, ChatGPT និង Gemini ក្នុងពេលតែមួយ... សូមរង់ចាំ 30–100 វិនាទី
        </div>
      )}
      {error && <div className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      {data && c && (
        <>
          <div className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">សេចក្តីសម្រេចរួម</div>
                <div className="mt-1 text-sm font-medium">{c.label}</div>
              </div>
              <div className={`rounded-xl border px-6 py-2 text-3xl font-bold tracking-wide ${badgeCls(c.direction)}`}>
                {c.direction}
                {c.direction !== "NO TRADE" && c.entryType ? <span className="ml-2 text-xs font-medium opacity-80">{c.entryType}</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-400">BUY {c.votes?.BUY ?? 0}</span>
              <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-400">SELL {c.votes?.SELL ?? 0}</span>
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-400">NO TRADE {c.votes?.["NO TRADE"] ?? 0}</span>
              {c.direction !== "NO TRADE" && <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">Confidence {c.confidence}%</span>}
            </div>

            {c.direction !== "NO TRADE" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Cell label="Entry (median)" value={fmt(c.entry)} />
                <Cell label="Stop Loss" value={fmt(c.sl)} tone="text-rose-400" />
                <Cell label="TP 1" value={fmt(c.tp1)} tone="text-emerald-400" />
                <Cell label="TP 2" value={fmt(c.tp2)} tone="text-emerald-400" />
                <Cell label="R : R" value={c.rr ?? "-"} tone="text-primary" />
              </div>
            )}

            {c.newsRisk && c.newsRisk !== "none" && (
              <div className={`rounded-lg border p-3 text-sm ${c.newsRisk === "avoid" ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                📰 មានព័ត៌មានធំជិតមកដល់ ({c.newsRisk === "avoid" ? "គួរជៀសវាង" : "ប្រុងប្រយ័ត្ន"})
              </div>
            )}
            {Array.isArray(c.warnings) && c.warnings.length > 0 && (
              <div className="space-y-1 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">
                {c.warnings.map((w: string, i: number) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-md border border-border px-2 py-0.5">តម្លៃ {fmt(data.meta?.price)}</span>
              <span className="rounded-md border border-border px-2 py-0.5">{data.meta?.orderFlow ? "✅ Order Flow" : "— Order Flow"}</span>
              <span className="rounded-md border border-border px-2 py-0.5">{data.meta?.news ? "✅ News" : "— News"}</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {data.results.map((r: any) => <AiCard key={r.id} r={r} />)}
          </div>

          <p className="text-xs text-muted-foreground">
            ការបោះឆ្នោតភាគច្រើន (យ៉ាងតិច 2 ក្នុង 3)។ តម្លៃ Entry/SL/TP ជាកណ្តាល (median) នៃ AI ដែលស្របគ្នា ហើយត្រូវត្រួតពិនិត្យដោយកូដម្តងទៀត។ ជាការវិភាគដោយ AI សម្រាប់ជំនួយប៉ុណ្ណោះ មិនមែនជាការផ្តល់ដំបូន្មានវិនិយោគ ឬធានាលទ្ធផលទេ។
          </p>
        </>
      )}
    </div>
  );
}
