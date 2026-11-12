export type TradeRow = {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  status: "OPEN" | "CLOSED";
  session: "ASIA" | "LONDON" | "NEW_YORK";
  setups: string[];
  psychTags: string[];
  entry: number;
  exit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  rr: number | null;
  pnl: number | null;
  openedAt: string;
  closedAt: string | null;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeStats(trades: TradeRow[]) {
  const closed = trades
    .filter((t) => t.status === "CLOSED" && t.pnl != null)
    .sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""));
  const wins = closed.filter((t) => t.pnl! > 0);
  const losses = closed.filter((t) => t.pnl! < 0);
  const grossWin = sum(wins.map((t) => t.pnl!));
  const grossLoss = Math.abs(sum(losses.map((t) => t.pnl!)));
  const winRate = closed.length ? wins.length / closed.length : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  let eq = 0;
  return {
    count: closed.length,
    netPnl: grossWin - grossLoss,
    winRate,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: winRate * avgWin - (1 - winRate) * avgLoss, // per trade
    equity: closed.map((t) => ({ date: (t.closedAt ?? "").slice(0, 10), equity: (eq += t.pnl!) })),
  };
}

export function breakdown(trades: TradeRow[], key: "session" | "pair") {
  const groups = new Map<string, TradeRow[]>();
  trades.forEach((t) => groups.set(t[key], [...(groups.get(t[key]) ?? []), t]));
  return [...groups].map(([name, rows]) => ({ name, ...computeStats(rows) }));
}
