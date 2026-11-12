"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Plus, RefreshCw, TrendingDown, TrendingUp, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Seg } from "@/components/seg";
import { fmtPrice } from "@/lib/format";
import { canonical, isTradFi, tvSymbol } from "@/lib/markets";
import { cn } from "@/lib/utils";
import type { Signal } from "@/lib/scanner";

type ScanResult = {
  tf: string;
  scanned: number;
  failed: string[];
  errors?: Record<string, string>;
  closed: string[];
  notes: string[];
  signals: Signal[];
  at: number;
};

const FRAMES = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
];
const SIDES = [
  { value: "ALL", label: "All" },
  { value: "BUY", label: "Buy" },
  { value: "SELL", label: "Sell" },
];
const SCORES = [
  { value: "60", label: "60+" },
  { value: "70", label: "70+" },
  { value: "80", label: "80+" },
];

const DEFAULT_PAIRS = [
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "NAS100",
  "US30", "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
];
const GOLD_FOREX = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NAS100", "US30"];
const CRYPTO = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const TOP20 = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT",
  "LINKUSDT", "DOTUSDT", "TRXUSDT", "LTCUSDT", "BCHUSDT", "NEARUSDT", "ATOMUSDT", "UNIUSDT",
  "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT",
];
const STORE = "ict-hub-pairs";
const MAX_PAIRS = 30;

// "sol" -> SOLUSDT, "eth/btc" -> ETHBTC, "gold" -> XAUUSD, "eurusd" -> EURUSD
function normalizePair(input: string) {
  const raw = input.trim().toUpperCase();
  const explicit = /[\/-]/.test(raw);
  const clean = raw.replace(/[^A-Z0-9]/g, "");
  if (clean.length < 2) return "";
  const c = canonical(clean);
  if (isTradFi(c)) return c;
  if (explicit || /(USDT|USDC|FDUSD)$/.test(clean)) return clean;
  return clean + "USDT";
}

const panel = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur";

export function SignalsView() {
  const [tf, setTf] = useState("15m");
  const [side, setSide] = useState("ALL");
  const [minScore, setMinScore] = useState("60");
  const [auto, setAuto] = useState(true);
  const [pairs, setPairs] = useState<string[]>(DEFAULT_PAIRS);
  const [ready, setReady] = useState(false);
  const [pairInput, setPairInput] = useState("");
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length > 0) {
          setPairs(saved.filter((x): x is string => typeof x === "string").slice(0, MAX_PAIRS));
        }
      }
    } catch {
      /* ignore broken storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(pairs));
    } catch {
      /* storage blocked */
    }
  }, [pairs, ready]);

  const scan = useCallback(async () => {
    if (!ready || pairs.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan?tf=${tf}&symbols=${pairs.join(",")}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Scanner error (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [tf, pairs, ready]);

  const addPairs = () => {
    const added = pairInput
      .split(/[\s,;]+/)
      .map(normalizePair)
      .filter(Boolean);
    if (added.length === 0) return;
    setPairs((cur) => Array.from(new Set([...cur, ...added])).slice(0, MAX_PAIRS));
    setPairInput("");
  };
  const removePair = (p: string) => setPairs((cur) => cur.filter((x) => x !== p));

  useEffect(() => {
    scan();
  }, [scan]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(scan, 60_000);
    return () => clearInterval(id);
  }, [auto, scan]);

  const shown = (data?.signals ?? []).filter(
    (s) => s.score >= Number(minScore) && (side === "ALL" || s.direction === side)
  );
  const buys = shown.filter((s) => s.direction === "BUY").length;
  const sells = shown.length - buys;
  const updated = data
    ? new Date(data.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false })
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signal Scanner</h1>
          <p className="text-sm text-muted-foreground">
            ICT / SMC setups scanned on real Binance market data: liquidity sweep, MSS and FVG entry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={tf} onChange={setTf} options={FRAMES} />
          <Button size="sm" variant="outline" onClick={scan} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "Scanning…" : "Scan now"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Seg value={side} onChange={setSide} options={SIDES} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Min score <Seg value={minScore} onChange={setMinScore} options={SCORES} />
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Auto refresh (60s){updated && <span className="tabular-nums">· updated {updated}</span>}
        </label>
      </div>

      <div className={cn(panel, "space-y-3 p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            Pairs to scan <span className="font-normal text-muted-foreground">({pairs.length}/{MAX_PAIRS})</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" onClick={() => setPairs(GOLD_FOREX)} className="rounded-md border border-white/10 px-2.5 py-1 text-muted-foreground hover:text-foreground">
              Gold &amp; Forex
            </button>
            <button type="button" onClick={() => setPairs(CRYPTO)} className="rounded-md border border-white/10 px-2.5 py-1 text-muted-foreground hover:text-foreground">
              Crypto
            </button>
            <button type="button" onClick={() => setPairs(TOP20)} className="rounded-md border border-white/10 px-2.5 py-1 text-muted-foreground hover:text-foreground">
              Top 20 crypto
            </button>
            <button type="button" onClick={() => setPairs(DEFAULT_PAIRS)} className="rounded-md border border-white/10 px-2.5 py-1 text-muted-foreground hover:text-foreground">
              Reset
            </button>
            <button type="button" onClick={() => setPairs([])} className="rounded-md border border-white/10 px-2.5 py-1 text-muted-foreground hover:text-rose-300">
              Clear
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={pairInput}
            onChange={(e) => setPairInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPairs();
            }}
            placeholder="Add pairs: XAUUSD, EURUSD, NAS100, SOL, PEPE (space or comma)"
            className="h-9 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-emerald-400/50"
          />
          <Button size="sm" onClick={addPairs}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {pairs.length === 0 && <p className="text-xs text-muted-foreground">No pairs yet. Add one above or pick a preset.</p>}
          {pairs.map((p) => (
            <span key={p} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1.5 text-xs font-medium">
              {p.replace("USDT", "")}
              <button
                type="button"
                onClick={() => removePair(p)}
                aria-label={`Remove ${p}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10 hover:text-rose-300"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Gold (XAUUSD), Forex (EURUSD, GBPJPY...), Indices (NAS100, US30, SPX500, DXY) use Yahoo Finance data. Anything else is a Binance crypto pair (USDT by default). Your list is saved in this browser.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pairs scanned" value={data ? String(data.scanned) : "–"} />
        <Stat label="Signals" value={String(shown.length)} />
        <Stat label="Buy setups" value={String(buys)} tone="text-emerald-400" />
        <Stat label="Sell setups" value={String(sells)} tone="text-rose-400" />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}. Check your internet connection and try again.
        </div>
      )}
      {data && data.closed.length > 0 && (
        <p className="text-xs text-sky-300">Market closed (no fresh candles): {data.closed.join(", ")}</p>
      )}
      {data && data.notes.length > 0 && <p className="text-xs text-amber-300">{data.notes.join(" · ")}</p>}
      {data && data.failed.length > 0 && (
        <div className="space-y-0.5 text-xs text-amber-300">
          <p>Could not load {data.failed.length} pair(s):</p>
          {data.failed.map((f) => (
            <p key={f} className="break-all text-amber-200/80">
              {f}: {data.errors?.[f] ?? "not found"}
            </p>
          ))}
        </div>
      )}

      {shown.length === 0 && !loading && !error && (
        <div className={cn(panel, "p-10 text-center")}>
          <p className="text-base font-medium">No setups match right now</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The scanner only shows complete sequences (sweep, then structure shift, then entry zone). Try
            another timeframe, lower the minimum score, or wait for the next London or New York killzone.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((s) => (
          <SignalCard key={s.id} s={s} />
        ))}
      </div>

      <div className={cn(panel, "p-5 text-sm text-muted-foreground")}>
        <p className="mb-2 font-medium text-foreground">How a signal is built</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Price takes a swing high or low (liquidity sweep) and closes back inside the range.</li>
          <li>Price then breaks the last opposite swing (market structure shift).</li>
          <li>Entry sits in the unfilled fair value gap, or at the 70.5% retracement if none exists.</li>
          <li>Stop loss goes beyond the sweep. Targets are the impulse extreme (TP1) and 3R (TP2).</li>
          <li>Score adds points for trend alignment (EMA 50) and London / New York killzones.</li>
        </ol>
        <p className="mt-3 text-xs">
          Gold, Forex and Indices come from Yahoo Finance (free, can be a few seconds delayed). Crypto comes from
          Binance. Signals are educational, not financial advice.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cn(panel, "p-4")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function SignalCard({ s }: { s: Signal }) {
  const [copied, setCopied] = useState(false);
  const buy = s.direction === "BUY";
  const plan = [
    `${s.direction} ${s.symbol} (${s.tf})`,
    `Entry ${fmtPrice(s.entry)}`,
    `SL ${fmtPrice(s.stopLoss)}`,
    `TP1 ${fmtPrice(s.takeProfit[0])}`,
    `TP2 ${fmtPrice(s.takeProfit[1])}`,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plan);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className={cn(panel, "overflow-hidden")}>
      <div className={cn("h-1 w-full", buy ? "bg-emerald-400" : "bg-rose-400")} />
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{s.symbol.replace("USDT", "")}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-muted-foreground">{s.tf}</span>
            </div>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">Now {fmtPrice(s.price)}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                buy ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
              )}
            >
              {buy ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {s.direction}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                s.status === "IN ZONE"
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-white/10 text-muted-foreground"
              )}
            >
              {s.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Level label="Entry" value={fmtPrice(s.entry)} />
          <Level label="Stop loss" value={fmtPrice(s.stopLoss)} tone="text-rose-300" />
          <Level label="TP1" value={fmtPrice(s.takeProfit[0])} tone="text-emerald-300" />
          <Level label="TP2 (3R)" value={fmtPrice(s.takeProfit[1])} tone="text-emerald-300" />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Setup score</span>
            <span className="font-semibold tabular-nums">{s.score}/100</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
              style={{ width: `${s.score}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {s.tags.map((t) => (
            <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
              {t}
            </span>
          ))}
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
            TP1 {s.rr.toFixed(1)}R
          </span>
        </div>

        <div className="flex gap-2 pt-1">
          <Link
            href={`/market?symbol=${tvSymbol(s.symbol)}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
          >
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open chart
          </Link>
          <Button size="sm" variant="outline" className="flex-1" onClick={copy}>
            {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy plan"}
          </Button>
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
