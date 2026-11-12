"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles, TrendingDown, TrendingUp, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Seg } from "@/components/seg";
import { fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Analysis = {
  action: "BUY" | "SELL" | "WAIT";
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number[];
  concepts: string[];
  reasoning: string;
  invalidation: string;
  riskNotes: string;
};

const FRAMES = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1H", label: "1H" },
  { value: "4H", label: "4H" },
  { value: "1D", label: "1D" },
];

const panel = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur";

// Shrinks big screenshots and converts to JPEG so the upload stays small
async function toJpeg(file: File, maxSide = 2000): Promise<{ data: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#0b0e11";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const url = canvas.toDataURL("image/jpeg", 0.9);
  return { preview: url, data: url.split(",")[1] };
}

export function AnalyzeView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<{ data: string; preview: string } | null>(null);
  const [pair, setPair] = useState("");
  const [tf, setTf] = useState("15m");
  const [notes, setNotes] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);

  const loadFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG or WEBP).");
      return;
    }
    setError(null);
    setResult(null);
    try {
      setImage(await toJpeg(file));
    } catch {
      setError("Could not read this image. Try a PNG or JPG screenshot.");
    }
  }, []);

  // Ctrl+V / Cmd+V anywhere on the page pastes a screenshot
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        loadFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  const analyze = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: image.data, pair, tf, notes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setResult(json.analysis as Analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const rr =
    result && result.entry !== null && result.stopLoss !== null && result.takeProfit[0] !== undefined
      ? Math.abs(result.takeProfit[0] - result.entry) / Math.abs(result.entry - result.stopLoss)
      : null;

  const copyPlan = async () => {
    if (!result) return;
    const lines = [
      `${result.action} ${pair || "chart"} (${tf}) | ${result.bias} | confidence ${result.confidence}/100`,
      result.entry !== null ? `Entry ${fmtPrice(result.entry)}` : "",
      result.stopLoss !== null ? `SL ${fmtPrice(result.stopLoss)}` : "",
      ...result.takeProfit.map((t, i) => `TP${i + 1} ${fmtPrice(t)}`),
      result.reasoning,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const buy = result?.action === "BUY";
  const sell = result?.action === "SELL";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chart Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          Upload a chart screenshot and Claude reads it with ICT / SMC rules: structure, liquidity, FVG and entry zone.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              loadFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              panel,
              "relative flex min-h-[320px] cursor-pointer items-center justify-center overflow-hidden border-dashed transition",
              dragging ? "border-emerald-400/60 bg-emerald-400/5" : "hover:border-white/20"
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                loadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.preview} alt="Chart to analyze" className="max-h-[560px] w-full object-contain" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImage(null);
                    setResult(null);
                  }}
                  className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="space-y-3 p-8 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                  <Upload className="h-5 w-5 text-emerald-300" />
                </span>
                <p className="text-sm font-medium">Drop a chart screenshot here, click to browse, or paste (Cmd + V)</p>
                <p className="text-xs text-muted-foreground">
                  Tips: include the price axis on the right, show 50-150 candles, and mark nothing over the candles.
                </p>
              </div>
            )}
          </div>

          <div className={cn(panel, "space-y-3 p-4")}>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={pair}
                onChange={(e) => setPair(e.target.value.toUpperCase())}
                placeholder="Pair (e.g. XAUUSD)"
                maxLength={30}
                className="h-9 w-44 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-emerald-400/50"
              />
              <Seg value={tf} onChange={setTf} options={FRAMES} />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Optional notes: e.g. London killzone, looking for sells after the Asia high sweep"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-emerald-400/50"
            />
            <Button onClick={analyze} disabled={!image || loading} className="w-full">
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Analyzing chart…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> Analyze chart
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          {!result && !error && !loading && (
            <div className={cn(panel, "p-8 text-center text-sm text-muted-foreground")}>
              The analysis will appear here. It shows the direction, entry, stop loss, targets, the ICT concepts it found and
              why.
            </div>
          )}

          {loading && (
            <div className={cn(panel, "p-8 text-center text-sm text-muted-foreground")}>
              Reading candles and levels… this takes 10-30 seconds.
            </div>
          )}

          {result && (
            <div className={cn(panel, "overflow-hidden")}>
              <div className={cn("h-1 w-full", buy ? "bg-emerald-400" : sell ? "bg-rose-400" : "bg-white/20")} />
              <div className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                      buy
                        ? "bg-emerald-400/15 text-emerald-300"
                        : sell
                          ? "bg-rose-400/15 text-rose-300"
                          : "bg-white/10 text-muted-foreground"
                    )}
                  >
                    {buy ? <TrendingUp className="h-4 w-4" /> : sell ? <TrendingDown className="h-4 w-4" /> : null}
                    {result.action === "WAIT" ? "WAIT: no clear setup" : result.action}
                  </span>
                  <span className="text-xs text-muted-foreground">Bias: {result.bias.toLowerCase()}</span>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Confidence</span>
                    <span className="font-semibold tabular-nums">{result.confidence}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                      style={{ width: `${result.confidence}%` }}
                    />
                  </div>
                </div>

                {(result.entry !== null || result.stopLoss !== null || result.takeProfit.length > 0) && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Level label="Entry" value={result.entry} />
                    <Level label="Stop loss" value={result.stopLoss} tone="text-rose-300" />
                    {result.takeProfit.map((t, i) => (
                      <Level key={i} label={`TP${i + 1}`} value={t} tone="text-emerald-300" />
                    ))}
                    {rr !== null && (
                      <div className="rounded-lg bg-white/[0.04] px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">R:R to TP1</p>
                        <p className="font-medium tabular-nums">1 : {rr.toFixed(1)}</p>
                      </div>
                    )}
                  </div>
                )}

                {result.concepts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {result.concepts.map((c) => (
                      <span key={c} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {result.reasoning && <p className="text-sm leading-relaxed">{result.reasoning}</p>}
                {result.invalidation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Invalidation:</span> {result.invalidation}
                  </p>
                )}
                {result.riskNotes && (
                  <p className="text-xs text-amber-300/90">
                    <span className="font-medium">Risk:</span> {result.riskNotes}
                  </p>
                )}

                <Button size="sm" variant="outline" className="w-full" onClick={copyPlan}>
                  {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy plan"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  AI analysis can be wrong, especially when levels are hard to read. Verify on your own chart. Educational only,
                  not financial advice.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Level({ label, value, tone }: { label: string; value: number | null; tone?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums font-medium", tone)}>{value === null ? "n/a" : fmtPrice(value)}</p>
    </div>
  );
}
