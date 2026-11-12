"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BookOpen, Crosshair, ClipboardList, Newspaper, Radar, Sparkles, Target, TrendingUp } from "lucide-react";
import { TVWidget, TV } from "@/components/tv-widget";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/market", label: "Market", icon: TrendingUp },
  { href: "/terminal", label: "Scan & Chart", icon: Crosshair },
  { href: "/signals", label: "Signal Scanner", icon: Radar },
  { href: "/orderflow", label: "Order Flow", icon: Target },
  { href: "/analyze", label: "AI Analyzer", icon: Sparkles },
  { href: "/indicator", label: "Indicator", icon: Target },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/journal", label: "Trade Journal", icon: ClipboardList },
  { href: "/dashboard", label: "Journal", icon: BookOpen },
];

const TICKER = {
  symbols: [
    { proName: "OANDA:XAUUSD", title: "Gold" },
    { proName: "OANDA:EURUSD", title: "EUR/USD" },
    { proName: "OANDA:GBPUSD", title: "GBP/USD" },
    { proName: "OANDA:USDJPY", title: "USD/JPY" },
    { proName: "TVC:DXY", title: "DXY" },
    { proName: "OANDA:NAS100USD", title: "NAS100" },
    { proName: "OANDA:US30USD", title: "US30" },
    { proName: "BINANCE:BTCUSDT", title: "BTC" },
    { proName: "BINANCE:ETHUSDT", title: "ETH" },
  ],
  showSymbolLogo: true,
  colorTheme: "dark",
  isTransparent: true,
  displayMode: "adaptive",
  locale: "en",
};

// Approximate session windows in UTC
function sessionOf(d: Date) {
  const h = d.getUTCHours();
  if (h >= 7 && h < 12) return { name: "London", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
  if (h >= 12 && h < 21) return { name: "New York", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
  return { name: "Asia", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = now
    ? now.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false })
    : "--:--:--";
  const sess = now ? sessionOf(now) : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.09),transparent_55%)]">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:gap-4 sm:px-4">
          <Link href="/market" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-200 via-amber-400 to-yellow-600 text-black shadow-lg shadow-amber-500/25">
              <Activity className="h-4 w-4" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight md:block">
              ICT Hub <span className="font-normal text-primary">Signals</span>
            </span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  <span className="hidden md:inline">{n.label}</span>
                  {active && (
                    <span className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3 text-xs">
            <span className="hidden items-center gap-1.5 text-emerald-400 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              LIVE
            </span>
            <span className="hidden tabular-nums text-muted-foreground sm:inline">{clock} GMT+7</span>
            {sess && (
              <span className={cn("rounded-full border px-2.5 py-1 font-medium", sess.cls)}>
                {sess.name}
              </span>
            )}
          </div>
        </div>
        <div className="h-[46px] overflow-hidden border-t border-border">
          <TVWidget src={`${TV}embed-widget-ticker-tape.js`} config={TICKER} className="h-full w-full" />
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-3 py-5 sm:px-4">{children}</div>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <div>Market data: TradingView, Twelve Data and Binance.</div>
        <div className="mt-1">
          AI analysis is for education only. Not financial advice. Trading involves risk.
        </div>
      </footer>
    </div>
  );
}
