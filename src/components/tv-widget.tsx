"use client";

import { memo, useEffect, useRef } from "react";

export const TV = "https://s3.tradingview.com/external-embedding/";

type Props = { src: string; config: Record<string, unknown>; className?: string };

function TVWidgetBase({ src, config, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(config);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    host.appendChild(inner);

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = key;
    host.appendChild(script);

    return () => {
      host.innerHTML = "";
    };
  }, [src, key]);

  return <div ref={ref} className={`tradingview-widget-container ${className ?? ""}`} />;
}

export const TVWidget = memo(TVWidgetBase);
