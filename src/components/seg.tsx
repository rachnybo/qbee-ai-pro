"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

export function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            value === o.value
              ? "bg-emerald-500/20 text-emerald-300"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
