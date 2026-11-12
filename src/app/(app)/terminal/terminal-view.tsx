"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Radar, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ProChart, type Layers } from "@/components/pro-chart";
import { Seg } from "@/components/seg";
import { fmtPrice } from "@/lib/format";
import { normalizePair, tvSymbol } from "@/lib/markets";
import type { Candle } from "@/lib/scanner";
import { buildView } from "@/lib/zones";
import { cn } from "@/lib/utils";

const FRAMES = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
];
const CHIPS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "NAS100", "US30", "BTCUSDT", "ETHUSDT", "SOLUSDT"];
const LAYER_LABELS: { key: keyof Layers; label: string; dot: string }[] = [
  { key: "fvg", label: "FVG", dot: "bg-emerald-400" },
  { key: "ob", label: "Order blocks", dot: "bg-blue-400" },
  { key: "liq", label: "Liquidity", dot: "bg-yellow-400" },
  { key: "kz", label: "Killzones", dot: "bg-amber-400" },
  { key: "pd", label: "Premium / Discount", dot: "bg-rose-400" },
  { key: "ema", label: "EMA 50 / 200", dot: "bg-sky-400" },
];

type CandleResponse = { symbol: string; tf: string; candles: Candle[]; note: string | null; at: number };

const panel = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur";

export function TerminalView() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [input, setInput] = useState("XAUUSD");
  const [tf, setTf] = useState("15m");
  const [layers, setLayers] = useState<Layers>({ fvg: true, ob: true, liq: true, kz: true, pd: true, ema: true });
  const [data, setData] = useState<CandleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json as CandleResponse);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [symbol, tf]);

  // scans automatically when the pair or timeframe changes
  useEffect(() => {
    scan();
  }, [scan]);

  const view = useMemo(() => {
    if (!data || data.candles.length < 80) return null;
    return buildView(data.symbol, data.tf, data.candles);
  }, [data]);

  const onScan = () => {
    const s = normalizePair(input);
    if (!s) return;
    setInput(s);
    if (s !== symbol) setSymbol(s);
    else scan();
  };

  const pick = (s: string) => {
    setInput(s);
    setSymbol(s);
  };

  const sig = view?.signal ?? null;
  const buy = sig?.direction === "BUY";
  const updated = data
    ? new Date(data.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false })
    : null;

  const copyPlan = async () => {
    if (!sig) return;
    const text = [
      `${sig.direction} ${sig.symbol} (${sig.tf})`,
      `Entry ${fmtPrice(sig.entry)}`,
      `SL ${fmtPrice(sig.stopLoss)}`,
      `TP1 ${fmtPrice(sig.takeProfit[0])}`,
      `TP2 ${fmtPrice(sig.takeProfit[1])}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scan &amp; Chart</h1>
          <p className="text-sm text-muted-foreground">
            One click: live chart with ICT zones (FVG, order blocks, liquidity, killzones) and a trade signal.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{updated ? `Updated ${updated} GMT+7` : ""}</span>
      </div>

      <div className={cn(panel, "space-y-3 p-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") onScan();
            }}
            placeholder="Pair: XAUUSD, EURUSD, BTC, SOL..."
            maxLength={30}
            className="h-10 w-52 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-emerald-400/50"
          />
          <Seg value={tf} onChange={setTf} options={FRAMES} />
          <Button onClick={onScan} disabled={loading} className="h-10 px-5">
            {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
            {loading ? "Scanning…" : "Scan"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                symbol === c
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
      )}
      {data?.note && <p className="text-xs text-amber-300">{data.note}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-2">
          <div className={cn(panel, "relative overflow-hidden")}>
            <ProChart candles={data?.candles ?? []} view={view} layers={layers} className="h-[520px] md:h-[640px]" />
            {loading && !data && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm text-muted-foreground">
                Loading {symbol}…
              </div>
            )}
            {data && data.candles.length < 80 && (
              <div className="absolute inset-x-0 bottom-3 text-center text-xs text-amber-300">
                Not enough candles to analyze this pair.
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LAYER_LABELS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayers((cur) => ({ ...cur, [l.key]: !cur[l.key] }))}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                  layers[l.key]
                    ? "border-white/20 bg-white/10 text-foreground"
                    : "border-white/10 text-muted-foreground opacity-60 hover:opacity-100"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", l.dot)} />
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {sig ? (
            <div className={cn(panel, "overflow-hidden")}>
              <div className={cn("h-1 w-full", buy ? "bg-emerald-400" : "bg-rose-400")} />
              <div className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                      buy ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
                    )}
                  >
                    {buy ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {sig.direction} {sig.symbol.replace("USDT", "")}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      sig.status === "IN ZONE"
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                        : "border-white/10 text-muted-foreground"
                    )}
                  >
                    {sig.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Level label="Entry" value={fmtPrice(sig.entry)} tone="text-sky-300" />
                  <Level label="Stop loss" value={fmtPrice(sig.stopLoss)} tone="text-rose-300" />
                  <Level label="TP1" value={fmtPrice(sig.takeProfit[0])} tone="text-emerald-300" />
                  <Level label="TP2 (3R)" value={fmtPrice(sig.takeProfit[1])} tone="text-emerald-300" />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Setup score</span>
                    <span className="font-semibold tabular-nums">{sig.score}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                      style={{ width: `${sig.score}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {sig.tags.map((t) => (
                    <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
                      {t}
                    </span>
                  ))}
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
                    TP1 {sig.rr.toFixed(1)}R
                  </span>
                </div>

                <Button size="sm" variant="outline" className="w-full" onClick={copyPlan}>
                  {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy plan"}
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn(panel, "p-5 text-sm")}>
              <p className="font-medium">{view ? "No complete setup right now" : "Press Scan to analyze"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A signal needs a liquidity sweep, then a market structure shift, then an entry zone. The chart still shows
                the zones to watch.
              </p>
            </div>
          )}

          {view && (
            <div className={cn(panel, "space-y-2 p-4 text-sm")}>
              <p className="font-semibold">Market map</p>
              <Row k="Structure" v={view.summary.bias} />
              <Row k="Price is in" v={`${view.summary.pd} (EQ ${fmtPrice(view.summary.eq)})`} />
              <Row k="Open FVGs" v={String(view.summary.fvgCount)} />
              <Row k="Order blocks" v={String(view.summary.obCount)} />
              {view.summary.levels.length > 0 && (
                <div className="pt-1">
                  <p className="mb-1 text-xs text-muted-foreground">Liquidity targets</p>
                  <div className="space-y-0.5 text-xs tabular-nums">
                    {view.summary.levels.map((l, i) => (
                      <div key={`${l.label}-${i}`} className="flex justify-between">
                        <span className={l.price > view.summary.price ? "text-yellow-300" : "text-sky-300"}>{l.label}</span>
                        <span>{fmtPrice(l.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Link
            href={`/market?symbol=${tvSymbol(symbol)}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
          >
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open on TradingView chart
          </Link>
          <p className="text-[11px] text-muted-foreground">
            Zones and signals are generated by simple rules and can be wrong. Educational only, not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}

function Level({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums font-medium", tone)}>{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
