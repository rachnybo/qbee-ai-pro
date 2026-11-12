"use client";

import { useEffect, useState } from "react";
import { Zap, Activity, Bot, History, Newspaper, Bell, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function QBeeTerminalPage() {
  const [activeTab, setActiveTab] = useState("analysis");
  const [timeframe, setTimeframe] = useState("15m");
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  useEffect(() => {
    // ដំណើរការបង្កប់ TradingView Chart
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (typeof window !== "undefined" && (window as any).TradingView) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: "OANDA:XAUUSD",
          interval: timeframe === "5m" ? "5" : timeframe === "15m" ? "15" : timeframe === "1h" ? "60" : "240",
          timezone: "Asia/Bangkok",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#131722",
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          container_id: "qbee_tv_chart",
        });
      }
    };
    document.head.appendChild(script);
  }, [timeframe]);

  // មុខងារសម្រាប់ចុច Analyze (ហៅទិន្នន័យពី API Scan)
  const handleAnalyze = async () => {
    setLoading(true);
    setAnalysisResult(null);
    try {
      const res = await fetch(`/api/scan?symbols=XAUUSD&tf=${timeframe}`);
      const data = await res.json();
      setAnalysisResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-black text-white relative overflow-hidden">
      {/* របារ Alerts ខាងលើ */}
      <div className="flex items-center justify-between bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-amber-300">
          <Send className="h-3.5 w-3.5" />
          <span>Link Telegram to get TP/SL alerts for your QBee signals.</span>
        </div>
        <button className="rounded bg-amber-400 px-2 py-0.5 font-semibold text-black hover:bg-amber-300">
          Link now
        </button>
      </div>

      {/* Header Symbol Info */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg text-amber-400">QBee</span>
          <span className="text-xl font-bold tracking-tight">XAUUSD</span>
          <span className="text-sm font-semibold text-emerald-400 tabular-nums">4,021.30 (+2.82%)</span>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full bg-zinc-800 p-2 hover:bg-zinc-700">
            <Bell className="h-4 w-4 text-zinc-300" />
          </button>
          <div className="h-8 w-8 rounded-full bg-amber-400 font-bold text-black flex items-center justify-center text-xs">
            QB
          </div>
        </div>
      </div>

      {/* Timeframe Selector */}
      <div className="flex items-center gap-4 bg-zinc-950 px-4 py-2 text-xs text-zinc-400 border-b border-white/5">
        {["5m", "15m", "1h", "4h"].map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-2 py-1 rounded transition",
              timeframe === tf ? "text-amber-400 font-bold bg-white/5" : "hover:text-white"
            )}
          >
            {tf}
          </button>
        ))}
        <span className="ml-auto text-zinc-400 text-[11px] rounded bg-zinc-900 border border-white/10 px-2 py-1">
          NFP in 2d 6h
        </span>
      </div>

      {/* ក្រាហ្វ TradingView Chart */}
      <div className="flex-1 w-full bg-black relative">
        <div id="qbee_tv_chart" className="h-full w-full" />
      </div>

      {/* Bottom Sheet Analysis Panel */}
      <div className="rounded-t-2xl border-t border-white/10 bg-zinc-950/95 backdrop-blur p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-6 border-b border-white/10 pb-2 text-sm text-zinc-400 font-medium">
          <button
            onClick={() => setActiveTab("analysis")}
            className={cn("flex items-center gap-1.5 pb-1 transition", activeTab === "analysis" && "text-white border-b-2 border-amber-400 font-semibold")}
          >
            <Activity className="h-4 w-4" /> Analysis
          </button>
          <button
            onClick={() => setActiveTab("bot")}
            className={cn("flex items-center gap-1.5 pb-1 transition", activeTab === "bot" && "text-white border-b-2 border-amber-400 font-semibold")}
          >
            <Bot className="h-4 w-4" /> Bot
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn("flex items-center gap-1.5 pb-1 transition", activeTab === "history" && "text-white border-b-2 border-amber-400 font-semibold")}
          >
            <History className="h-4 w-4" /> History
          </button>
          <button
            onClick={() => setActiveTab("news")}
            className={cn("flex items-center gap-1.5 pb-1 transition", activeTab === "news" && "text-white border-b-2 border-amber-400 font-semibold")}
          >
            <Newspaper className="h-4 w-4" /> News
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="font-bold text-sm">XAUUSD · {timeframe}</span>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                {loading ? "SCANNING..." : "READY"}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900 py-3 text-sm font-semibold hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> : <Activity className="h-4 w-4 text-amber-400" />}
              Analyze
            </button>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-bold text-black hover:bg-amber-300 transition disabled:opacity-50"
            >
              <Zap className="h-4 w-4 fill-black" /> Best setup
            </button>
          </div>

          {/* Display Analysis Results */}
          {analysisResult ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-400">QBee AI Scan Result ({timeframe}):</p>
              <p className="text-zinc-300">Scanned Pairs: {analysisResult.scanned}</p>
              <p className="text-zinc-300">Signals Found: {analysisResult.signals?.length || 0}</p>
              {analysisResult.signals?.length > 0 ? (
                <div className="text-emerald-400 font-medium pt-1">
                  Setup: {analysisResult.signals[0].type} at {analysisResult.signals[0].entry} (Score: {analysisResult.signals[0].score})
                </div>
              ) : (
                <div className="text-zinc-400">No high-probability setup matching current liquidity sweep yet. Try lower timeframe.</div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3 text-center text-xs text-zinc-400">
              Tap <span className="font-semibold text-white">Analyze</span> for a read of XAUUSD {timeframe} — fresh AI analysis powered by QBee scanner.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}