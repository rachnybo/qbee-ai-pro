"use client";
import { useState } from "react";
import { TVWidget, TV } from "@/components/tv-widget";

const FEEDS = [
  { id: "gold", label: "🥇 Gold", cfg: { feedMode: "symbol", symbol: "OANDA:XAUUSD" } },
  { id: "forex", label: "💱 Forex", cfg: { feedMode: "market", market: "forex" } },
  { id: "crypto", label: "₿ Crypto", cfg: { feedMode: "market", market: "crypto" } },
  { id: "index", label: "📈 Indices", cfg: { feedMode: "market", market: "index" } },
];

const KEY_EVENTS = [
  { name: "NFP (Non-Farm Payrolls)", note: "សុក្រដំបូងនៃខែ · ធ្វើឲ្យមាសចុះឡើងខ្លាំង" },
  { name: "CPI (អតិផរណា)", note: "ប៉ះពាល់ការរំពឹងអត្រាការប្រាក់ Fed ដោយផ្ទាល់" },
  { name: "FOMC / Fed Rate Decision", note: "ព្រឹត្តិការណ៍ធំបំផុតសម្រាប់ USD និងមាស" },
  { name: "សុន្ទរកថា Powell", note: "អាចប្តូរទិសដៅភ្លាមៗក្នុងពេលនិយាយ" },
  { name: "Unemployment Claims / PMI", note: "ប៉ះពាល់មធ្យម តែមាន volatility ម៉ោងចេញព័ត៌មាន" },
];

export default function NewsPage() {
  const [feed, setFeed] = useState("gold");
  const [impact, setImpact] = useState<"high" | "all">("high");
  const f = FEEDS.find((x) => x.id === feed)!;

  const newsCfg = {
    ...f.cfg,
    colorTheme: "dark",
    isTransparent: true,
    displayMode: "regular",
    width: "100%",
    height: "100%",
    locale: "en",
  };
  const calCfg = {
    colorTheme: "dark",
    isTransparent: true,
    width: "100%",
    height: "100%",
    locale: "en",
    importanceFilter: impact === "high" ? "1" : "-1,0,1",
    countryFilter: "us,eu,gb,jp,cn,ca,au",
  };

  const pill = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Market <span className="text-primary">News</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ព័ត៌មានទីផ្សារ និងប្រតិទិនសេដ្ឋកិច្ច (ព័ត៌មានធំៗធ្វើឲ្យ signal មិនអាចទុកចិត្តបាន)
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {FEEDS.map((x) => (
              <button key={x.id} onClick={() => setFeed(x.id)} className={pill(feed === x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="h-[720px] overflow-hidden rounded-lg">
            <TVWidget key={feed} src={`${TV}embed-widget-timeline.js`} config={newsCfg} className="h-full w-full" />
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">📅 ប្រតិទិនសេដ្ឋកិច្ច</div>
              <div className="flex gap-1">
                <button onClick={() => setImpact("high")} className={pill(impact === "high")}>High</button>
                <button onClick={() => setImpact("all")} className={pill(impact === "all")}>ទាំងអស់</button>
              </div>
            </div>
            <div className="h-[460px] overflow-hidden rounded-lg">
              <TVWidget key={impact} src={`${TV}embed-widget-events.js`} config={calCfg} className="h-full w-full" />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">ម៉ោងបង្ហាញតាមម៉ោងកុំព្យូទ័ររបស់អ្នក។</p>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-3 text-sm font-semibold text-primary">⚠️ ព័ត៌មានដែលប៉ះពាល់មាស</div>
            <ul className="space-y-2.5 text-sm leading-relaxed">
              {KEY_EVENTS.map((e) => (
                <li key={e.name}>
                  <b>{e.name}</b>
                  <div className="text-xs text-muted-foreground">{e.note}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              គន្លឹះ: ជៀសវាងបើក trade ថ្មី 15–30 នាទី មុន និងក្រោយព័ត៌មានធំ ព្រោះ spread ធំ និងតម្លៃអាចលោតជាមុនប៉ះ SL។ សូមពិនិត្យ Pre-order ដែលនៅរង់ចាំ ក្នុងពេលជិតព័ត៌មាន។
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
