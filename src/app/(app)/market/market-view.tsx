"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Seg } from "@/components/seg";
import { TVWidget, TV } from "@/components/tv-widget";
import { fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const SYMBOLS = [
  { label: "XAUUSD", tv: "OANDA:XAUUSD" },
  { label: "EURUSD", tv: "OANDA:EURUSD" },
  { label: "GBPUSD", tv: "OANDA:GBPUSD" },
  { label: "USDJPY", tv: "OANDA:USDJPY" },
  { label: "NAS100", tv: "OANDA:NAS100USD" },
  { label: "US30", tv: "OANDA:US30USD" },
  { label: "DXY", tv: "TVC:DXY" },
  { label: "BTCUSDT", tv: "BINANCE:BTCUSDT" },
  { label: "ETHUSDT", tv: "BINANCE:ETHUSDT" },
];

const FRAMES = [
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "60", label: "1H" },
  { value: "240", label: "4H" },
  { value: "D", label: "1D" },
];
const TA_FRAME: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", D: "1D" };

type Tick = { symbol: string; price: number; change: number; volume: number };

const panel = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur";

export function MarketView() {
  const params = useSearchParams();
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "OANDA:XAUUSD");
  const [tf, setTf] = useState("15");
  const [ticks, setTicks] = useState<Tick[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/prices", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setTicks(j.ticks ?? []);
      } catch {
        /* keep last prices */
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
          <p className="text-sm text-muted-foreground">
            Live TradingView charts for Gold, Forex, Indices and Crypto.
          </p>
        </div>
        <Seg value={tf} onChange={setTf} options={FRAMES} />
      </div>

      <div className="flex flex-wrap gap-2">
        {SYMBOLS.map((s) => (
          <button
            key={s.tv}
            type="button"
            onClick={() => setSymbol(s.tv)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              symbol === s.tv
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className={cn(panel, "h-[640px] overflow-hidden")}>
          <TVWidget
            src={`${TV}embed-widget-advanced-chart.js`}
            className="h-full w-full"
            config={{
              autosize: true,
              symbol,
              interval: tf,
              timezone: "Asia/Bangkok",
              theme: "dark",
              style: "1",
              locale: "en",
              backgroundColor: "rgba(10, 12, 16, 1)",
              gridColor: "rgba(255, 255, 255, 0.04)",
              allow_symbol_change: true,
              calendar: false,
              hide_side_toolbar: false,
              support_host: "https://www.tradingview.com",
            }}
          />
        </div>

        <div className="space-y-4">
          <div className={cn(panel, "p-4")}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Live crypto prices</h2>
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Binance
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {ticks.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Loading prices…</p>}
              {ticks.map((t) => {
                const up = t.change >= 0;
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => setSymbol(`BINANCE:${t.symbol}`)}
                    className="flex w-full items-center justify-between py-2 text-left transition hover:bg-white/5"
                  >
                    <span className="text-sm font-medium">{t.symbol.replace("USDT", "")}</span>
                    <span className="flex items-center gap-3 text-sm tabular-nums">
                      {fmtPrice(t.price)}
                      <span
                        className={cn(
                          "flex w-[72px] items-center justify-end gap-1 text-xs",
                          up ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {up ? "+" : ""}
                        {t.change.toFixed(2)}%
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={cn(panel, "h-[420px] overflow-hidden")}>
            <TVWidget
              src={`${TV}embed-widget-technical-analysis.js`}
              className="h-full w-full"
              config={{
                interval: TA_FRAME[tf] ?? "15m",
                width: "100%",
                height: "100%",
                symbol,
                showIntervalTabs: true,
                displayMode: "single",
                locale: "en",
                colorTheme: "dark",
                isTransparent: true,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(panel, "h-[480px] overflow-hidden")}>
          <TVWidget
            src={`${TV}embed-widget-events.js`}
            className="h-full w-full"
            config={{
              colorTheme: "dark",
              isTransparent: true,
              locale: "en",
              countryFilter: "us,eu,gb,jp",
              importanceFilter: "0,1",
              width: "100%",
              height: "100%",
            }}
          />
        </div>
        <div className={cn(panel, "h-[480px] overflow-hidden")}>
          <TVWidget
            src={`${TV}embed-widget-market-overview.js`}
            className="h-full w-full"
            config={{
              colorTheme: "dark",
              dateRange: "1D",
              showChart: true,
              locale: "en",
              isTransparent: true,
              showSymbolLogo: true,
              showFloatingTooltip: false,
              width: "100%",
              height: "100%",
              tabs: [
                {
                  title: "Forex",
                  symbols: [{ s: "OANDA:EURUSD" }, { s: "OANDA:GBPUSD" }, { s: "OANDA:USDJPY" }, { s: "OANDA:XAUUSD" }],
                },
                {
                  title: "Indices",
                  symbols: [{ s: "OANDA:NAS100USD" }, { s: "OANDA:US30USD" }, { s: "OANDA:SPX500USD" }, { s: "TVC:DXY" }],
                },
                {
                  title: "Crypto",
                  symbols: [{ s: "BINANCE:BTCUSDT" }, { s: "BINANCE:ETHUSDT" }, { s: "BINANCE:SOLUSDT" }],
                },
              ],
            }}
          />
        </div>
      </div>
    </div>
  );
}
