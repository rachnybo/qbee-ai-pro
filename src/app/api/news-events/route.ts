import { NextResponse } from "next/server";
import { gate } from "@/lib/gate";

// Upcoming high-impact USD events (the same weekly calendar feed many traders use).
export async function GET(req: Request) {
  const g = gate(req);
  if (g) return g;
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json();
    if (!Array.isArray(j)) throw new Error("ទម្រង់ទិន្នន័យមិនត្រឹមត្រូវ");
    const levels = new URL(req.url).searchParams.get("impact") === "all" ? ["High", "Medium"] : ["High"];
    const events = (j as any[])
      .filter((e) => e.country === "USD" && levels.includes(e.impact))
      .map((e) => ({
        id: `${e.date}|${e.title}`,
        title: String(e.title),
        date: String(e.date),
        impact: String(e.impact),
        forecast: String(e.forecast || ""),
        previous: String(e.previous || ""),
      }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    return NextResponse.json({ events });
  } catch (e: any) {
    return NextResponse.json({ error: `ទាញប្រតិទិនមិនបាន៖ ${e.message}` }, { status: 502 });
  }
}
