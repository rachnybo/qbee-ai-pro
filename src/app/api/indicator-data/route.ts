import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "XAU/USD";
    const interval = searchParams.get("interval") || "5min";
    const size = searchParams.get("size") || "500";
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol
    )}&interval=${interval}&outputsize=${size}&timezone=UTC&apikey=${process.env.TWELVEDATA_API_KEY}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (json.status === "error") throw new Error(json.message);
    const bars = (json.values as any[]).reverse().map((v) => {
      const s = String(v.datetime);
      const iso = s.includes(" ") ? s.replace(" ", "T") + "Z" : s + "T00:00:00Z";
      return {
        time: Math.floor(Date.parse(iso) / 1000),
        open: +v.open,
        high: +v.high,
        low: +v.low,
        close: +v.close,
      };
    });
    return NextResponse.json({ symbol, interval, bars });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
