import { NextResponse } from "next/server";

export async function GET() {
  try {
    const news = [
      {
        id: "1",
        time: "Just now",
        title: "XAUUSD Holds Above $4,000 Level Ahead of High-Impact US Economic Data",
        category: "GOLD",
        impact: "high",
      },
      {
        id: "2",
        time: "20m ago",
        title: "DXY Dollar Index Rebounds slightly as Federal Reserve Signals Cautious Rate Outlook",
        category: "FOREX",
        impact: "medium",
      },
      {
        id: "3",
        time: "1h ago",
        title: "ICT Liquidity Sweep Identified on NAS100 & US30 Asian Session Highs",
        category: "INDICES",
        impact: "high",
      },
      {
        id: "4",
        time: "3h ago",
        title: "Bitcoin Volume Delta Shows Steady Order Flow Accumulation",
        category: "CRYPTO",
        impact: "low",
      },
    ];

    return NextResponse.json({ success: true, news });
  } catch (error) {
    return NextResponse.json({ success: false, news: [] }, { status: 500 });
  }
}