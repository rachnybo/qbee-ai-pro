"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/scanner";
import type { View, Zone, ZoneKind } from "@/lib/zones";
import { cn } from "@/lib/utils";

export type Layers = { fvg: boolean; ob: boolean; liq: boolean; kz: boolean; pd: boolean; ema: boolean };

const OFFSET = 7 * 3600; // show GMT+7 on the time axis
const pad = (n: number) => String(n).padStart(2, "0");
const sec = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

function fmtTime(t: number, withDate: boolean) {
  const d = new Date((t + OFFSET) * 1000);
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withDate ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${hm}` : hm;
}

function layerOn(kind: ZoneKind, l: Layers) {
  switch (kind) {
    case "FVG":
      return l.fvg;
    case "OB":
      return l.ob;
    case "LQ":
      return l.liq;
    case "KZ":
      return l.kz;
    case "PD":
      return l.pd;
    default:
      return true;
  }
}

type Handles = {
  chart: IChartApi;
  candle: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  e50: ISeriesApi<"Line">;
  e200: ISeriesApi<"Line">;
  markers: { setMarkers: (m: never[]) => void } & Record<string, unknown>;
};

export function ProChart({
  candles,
  view,
  layers,
  className,
}: {
  candles: Candle[];
  view: View | null;
  layers: Layers;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hRef = useRef<Handles | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const zonesRef = useRef<{ el: HTMLDivElement; zone: Zone }[]>([]);
  const layersRef = useRef(layers);

  // 1) create the chart once + keep the zone overlay in sync with the chart every frame
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0a0c10" }, textColor: "#9aa4b2", fontSize: 12 },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.1)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 18,
        tickMarkFormatter: (time: unknown, type: number) =>
          typeof time === "number" ? fmtTime(time, type <= 2) : String(time),
      },
      localization: {
        timeFormatter: (time: unknown) => (typeof time === "number" ? fmtTime(time, true) : String(time)),
      },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const e50 = chart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const e200 = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const markers = createSeriesMarkers(candle, []);

    hRef.current = { chart, candle, volume, e50, e200, markers: markers as unknown as Handles["markers"] };

    let raf = 0;
    const tick = () => {
      const overlay = overlayRef.current;
      if (overlay) {
        const ts = chart.timeScale();
        const plotW = overlay.clientWidth - chart.priceScale("right").width();
        const plotH = overlay.clientHeight - ts.height();
        for (const { el, zone } of zonesRef.current) {
          if (!layerOn(zone.kind, layersRef.current)) {
            el.style.display = "none";
            continue;
          }
          const x1 = ts.timeToCoordinate(sec(zone.t1));
          const x2 = zone.t2 === "end" ? plotW : ts.timeToCoordinate(sec(zone.t2));
          let y1 = 0;
          let y2 = plotH;
          if (zone.p1 !== null && zone.p2 !== null) {
            const a = candle.priceToCoordinate(zone.p1);
            const b = candle.priceToCoordinate(zone.p2);
            if (a === null || b === null) {
              el.style.display = "none";
              continue;
            }
            y1 = Math.min(a, b);
            y2 = Math.max(a, b);
          }
          if (x1 === null || x2 === null) {
            el.style.display = "none";
            continue;
          }
          const left = Math.max(0, Math.min(x1, x2));
          const right = Math.min(plotW, Math.max(x1, x2));
          if (right <= left) {
            el.style.display = "none";
            continue;
          }
          el.style.display = "block";
          el.style.left = `${left}px`;
          el.style.width = `${right - left}px`;
          el.style.top = `${y1}px`;
          el.style.height = `${zone.line ? 0 : Math.max(1, y2 - y1)}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      chart.remove();
      hRef.current = null;
      linesRef.current = [];
      zonesRef.current = [];
    };
  }, []);

  // 2) candles + indicators
  useEffect(() => {
    const h = hRef.current;
    if (!h || candles.length === 0) return;
    let last = 0;
    const rows = candles
      .map((c) => ({ ...c, time: sec(c.t) }))
      .filter((c) => {
        if (c.time <= last) return false; // times must strictly increase
        last = c.time;
        return true;
      });
    h.candle.setData(rows.map((c) => ({ time: c.time, open: c.o, high: c.h, low: c.l, close: c.c })));
    const hasVolume = rows.some((c) => c.v > 0);
    h.volume.applyOptions({ visible: hasVolume });
    h.volume.setData(
      rows.map((c) => ({ time: c.time, value: c.v, color: c.c >= c.o ? "rgba(16,185,129,0.28)" : "rgba(244,63,94,0.28)" }))
    );
    const n = rows.length;
    h.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 130), to: n + 18 });
  }, [candles]);

  // 3) zones, signal lines, markers
  useEffect(() => {
    const h = hRef.current;
    const overlay = overlayRef.current;
    if (!h || !overlay) return;

    for (const l of linesRef.current) h.candle.removePriceLine(l);
    linesRef.current = [];
    overlay.innerHTML = "";
    zonesRef.current = [];

    if (!view) {
      h.e50.setData([]);
      h.e200.setData([]);
      h.markers.setMarkers([] as never[]);
      return;
    }

    h.e50.setData(view.ema50.map((p) => ({ time: sec(p.time), value: p.value })));
    h.e200.setData(view.ema200.map((p) => ({ time: sec(p.time), value: p.value })));
    h.markers.setMarkers(
      view.marks.map((m) => ({
        time: sec(m.time),
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })) as never[]
    );

    const sig = view.signal;
    if (sig) {
      const add = (price: number, color: string, title: string) =>
        linesRef.current.push(
          h.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title })
        );
      add(sig.entry, "#38bdf8", "Entry");
      add(sig.stopLoss, "#f43f5e", "SL");
      add(sig.takeProfit[0], "#10b981", "TP1");
      add(sig.takeProfit[1], "#10b981", "TP2");
    }

    zonesRef.current = view.zones.map((zone) => {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.boxSizing = "border-box";
      el.style.pointerEvents = "none";
      el.style.display = "none";
      if (zone.line) {
        el.style.borderTop = `1px dashed ${zone.border}`;
      } else {
        el.style.background = zone.fill;
        el.style.border = `1px solid ${zone.border}`;
      }
      const label = document.createElement("span");
      label.textContent = zone.label;
      label.style.position = "absolute";
      label.style.left = "4px";
      label.style.top = zone.line ? "-13px" : "1px";
      label.style.fontSize = "10px";
      label.style.lineHeight = "12px";
      label.style.fontWeight = "600";
      label.style.whiteSpace = "nowrap";
      label.style.color = zone.border;
      el.appendChild(label);
      overlay.appendChild(el);
      return { el, zone };
    });
  }, [view]);

  // 4) layer toggles
  useEffect(() => {
    layersRef.current = layers;
    const h = hRef.current;
    if (h) {
      h.e50.applyOptions({ visible: layers.ema });
      h.e200.applyOptions({ visible: layers.ema });
    }
  }, [layers]);

  return (
    <div className={cn("relative", className)}>
      <div ref={hostRef} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
