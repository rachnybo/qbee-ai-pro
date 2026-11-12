"use client";
import { useEffect, useRef, useState } from "react";

const MODES = [
  { id: "scalp", icon: "⚡", label: "Scalping", hint: "H1 · M15 · M5" },
  { id: "day", icon: "📅", label: "Daily", hint: "H4 · H1 · M15" },
  { id: "swing", icon: "🌊", label: "Swing", hint: "W1 · D1 · H4" },
];
const SYMBOLS = ["XAU/USD", "EUR/USD", "GBP/USD", "BTC/USD", "ETH/USD", "NAS100", "US30"];

async function postJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

function fileToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Cannot read this image"));
    img.src = url;
  });
}

function Stat({ label, value, tone = "" }: { label: string; value: any; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value ?? "-"}</div>
    </div>
  );
}

function Result({ data, meta }: { data: any; meta?: any }) {
  const dir = data.direction;
  const badge =
    dir === "BUY"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
      : dir === "SELL"
      ? "border-rose-500/30 bg-rose-500/15 text-rose-400"
      : "border-amber-500/30 bg-amber-500/15 text-amber-400";
  const conf = Math.max(0, Math.min(100, Number(data.confidence) || 0));
  const news = data.newsRisk;

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {data.detected ? `${data.detected.symbol} · ${data.detected.timeframe}` : "AI Signal"}
          </div>
          <div className="mt-1 text-lg font-semibold leading-snug">{data.setup}</div>
        </div>
        <div className={`rounded-xl border px-5 py-2 text-2xl font-bold tracking-wide ${badge}`}>
          {dir}
          {dir !== "NO TRADE" && data.entryType ? <span className="ml-2 text-xs font-medium opacity-80">{data.entryType}</span> : null}
        </div>
      </div>

      {Array.isArray(data.warnings) && data.warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">
          {data.warnings.map((w: string, i: number) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {news && news !== "none" && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            news === "avoid" ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          <b>📰 ព័ត៌មាន ({news === "avoid" ? "គួរជៀសវាង" : "ប្រុងប្រយ័ត្ន"}): </b>
          {data.newsNote}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Bias</div>
          <div className="mt-1 font-semibold capitalize">{data.bias}</div>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Confidence</span>
            <span className="font-semibold text-foreground">{conf}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${conf}%` }} />
          </div>
        </div>
      </div>

      {dir !== "NO TRADE" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Entry" value={data.entry} />
          <Stat label="Stop Loss" value={data.sl} tone="text-rose-400" />
          <Stat label="TP 1" value={data.tp1} tone="text-emerald-400" />
          <Stat label="TP 2" value={data.tp2} tone="text-emerald-400" />
          <Stat label="R : R" value={data.rr} tone="text-primary" />
        </div>
      )}

      {data.waitFor ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <b className="text-primary">⏳ រង់ចាំ: </b>
          {data.waitFor}
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">ហេតុផលវិភាគ</div>
        <ul className="space-y-2 text-sm leading-relaxed">
          {data.reasoning?.map((r: string, i: number) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {data.scenarios && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">ករណីឡើង</div>
            {data.scenarios.bullish}
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-rose-400">ករណីចុះ</div>
            {data.scenarios.bearish}
          </div>
        </div>
      )}

      {data.keyLevels && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Support</div>
            <div className="flex flex-wrap gap-2">
              {data.keyLevels.support?.map((n: number, i: number) => (
                <span key={i} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs tabular-nums text-emerald-400">{n}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Resistance</div>
            <div className="flex flex-wrap gap-2">
              {data.keyLevels.resistance?.map((n: number, i: number) => (
                <span key={i} className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs tabular-nums text-rose-400">{n}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200/90">
        <span className="font-semibold">❌ Invalidation: </span>
        {data.invalidation}
      </div>

      {meta && (
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-0.5">🤖 {meta.model}</span>
          <span className="rounded-md border border-border px-2 py-0.5">⏱ {meta.seconds}s</span>
          <span className="rounded-md border border-border px-2 py-0.5">{meta.orderFlow ? "✅ Order Flow" : "— Order Flow"}</span>
          <span className="rounded-md border border-border px-2 py-0.5">{meta.news ? "✅ News" : "— News"}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        ជាការវិភាគដោយ AI សម្រាប់ជំនួយប៉ុណ្ណោះ មិនមែនជាការផ្តល់ដំបូន្មានវិនិយោគ ឬធានាលទ្ធផលទេ។
      </p>
    </div>
  );
}

export default function AnalyzePage() {
  const [tab, setTab] = useState<"live" | "image">("live");
  const [mode, setMode] = useState("scalp");
  const [symbol, setSymbol] = useState("XAU/USD");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadFile(file?: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setError("");
      setData(null);
      setPreview(await fileToJpeg(file));
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      if (item) {
        setTab("image");
        loadFile(item.getAsFile());
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function runLive() {
    setLoading(true); setError(""); setData(null); setMeta(null);
    try {
      const json = await postJson("/api/analyze", { symbol, mode });
      setData(json.analysis);
      setMeta(json.meta);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function runImage() {
    if (!preview) return;
    setLoading(true); setError(""); setData(null); setMeta(null);
    try {
      const json = await postJson("/api/analyze-chart", { image: preview, mode });
      setData(json.analysis);
      setMeta(json.meta);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  const tabBtn = (active: boolean) =>
    `flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
      active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          AI Market <span className="text-primary">Analysis</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ICT/SMC + Order Flow + ព័ត៌មាន ពី candle ពិត ឬពីរូប chart របស់អ្នក
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        <button className={tabBtn(tab === "live")} onClick={() => { setTab("live"); setData(null); setError(""); }}>
          📊 Live Data
        </button>
        <button className={tabBtn(tab === "image")} onClick={() => { setTab("image"); setData(null); setError(""); }}>
          📷 Scan រូប
        </button>
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

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        {tab === "live" ? (
          <>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Order Flow ពិតប្រាកដមានសម្រាប់ XAU/USD, BTC/USD, ETH/USD (ទិន្នន័យ Binance)។
              </p>
            </div>
            <button
              onClick={runLive}
              disabled={loading}
              className="w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "AI កំពុងវិភាគ..." : "Analyze Now"}
            </button>
          </>
        ) : (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]); }}
              className="cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center transition hover:border-primary"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="chart" className="mx-auto max-h-80 rounded-lg" />
              ) : (
                <>
                  <div className="text-4xl">📷</div>
                  <div className="mt-2 text-sm">ចុចជ្រើសរូប · អូសរូបមកទីនេះ · ឬ Paste (Cmd+V)</div>
                  <div className="mt-1 text-xs text-muted-foreground">Screenshot chart ពី TradingView / MT5</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
            <button
              onClick={runImage}
              disabled={loading || !preview}
              className="w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "AI កំពុងមើលរូប..." : "Scan & Analyze"}
            </button>
          </>
        )}
      </div>

      {loading && (
        <div className="animate-pulse rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          AI កំពុងគិតជ្រៅ (Indicators + Order Flow + News)... សូមរង់ចាំ 30–90 វិនាទី
        </div>
      )}
      {error && (
        <div className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>
      )}
      {data && <Result data={data} meta={meta} />}
    </div>
  );
}
