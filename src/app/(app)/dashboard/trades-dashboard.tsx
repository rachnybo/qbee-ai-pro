"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { breakdown, computeStats, type TradeRow } from "@/lib/analytics";

const ALL = "all";
const SESSIONS = ["ASIA", "LONDON", "NEW_YORK"];
const SETUPS = ["FVG", "ORDER_BLOCK", "BREAKER_BLOCK", "LIQUIDITY_SWEEP", "MSS", "SMT_DIVERGENCE"];
const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-muted-foreground");

export function TradesDashboard({ trades }: { trades: TradeRow[] }) {
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState(ALL);
  const [session, setSession] = useState(ALL);
  const [setup, setSetup] = useState(ALL);

  const filtered = useMemo(
    () =>
      trades.filter(
        (t) =>
          (!q || t.pair.toLowerCase().includes(q.toLowerCase())) &&
          (direction === ALL || t.direction === direction) &&
          (session === ALL || t.session === session) &&
          (setup === ALL || t.setups.includes(setup))
      ),
    [trades, q, direction, session, setup]
  );
  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const bySession = useMemo(() => breakdown(filtered, "session"), [filtered]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trading journal</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} trades in view</p>
        </div>
        <Button onClick={() => {/* open <TradeFormDialog /> */}}>
          <Plus className="mr-2 h-4 w-4" /> Log trade
        </Button>
      </header>

      {/* Headline numbers */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat title="Net P&L" value={money(stats.netPnl)} className={tone(stats.netPnl)} />
        <Stat title="Win rate" value={`${(stats.winRate * 100).toFixed(1)}%`} />
        <Stat title="Profit factor" value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"} />
        <Stat title="Expectancy / trade" value={money(stats.expectancy)} className={tone(stats.expectancy)} />
      </section>

      {/* Equity curve + session split */}
      <section className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Equity curve</CardTitle></CardHeader>
          <CardContent className="h-64">
            {stats.equity.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.equity}>
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Area dataKey="equity" stroke="#34d399" fill="url(#eq)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-24 text-center text-sm text-muted-foreground">
                Close a trade with a P&L to start your equity curve.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By session</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {bySession.length === 0 && <p className="text-sm text-muted-foreground">No closed trades yet.</p>}
            {bySession.map((s) => (
              <div key={s.name} className="flex items-baseline justify-between text-sm">
                <span>{label(s.name)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {s.count} trades · {(s.winRate * 100).toFixed(0)}%{" "}
                  <span className={tone(s.netPnl)}>{money(s.netPnl)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Filters */}
      <section className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="w-44 pl-8" placeholder="Search pair" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Filter value={direction} onChange={setDirection} placeholder="Direction" options={["BUY", "SELL"]} />
        <Filter value={session} onChange={setSession} placeholder="Session" options={SESSIONS} />
        <Filter value={setup} onChange={setSetup} placeholder="Setup" options={SETUPS} />
      </section>

      {/* Trades */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Pair</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">SL</TableHead>
                <TableHead className="text-right">TP</TableHead>
                <TableHead className="text-right">R:R</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead>Session</TableHead>
                <TableHead className="text-right">P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    No trades match these filters. Log one, or send a TradingView alert with <code>"journal": true</code>.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => {/* open edit dialog */}}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(t.openedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium">{t.pair}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={t.direction === "BUY" ? "text-emerald-400" : "text-rose-400"}>
                      {t.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.entry}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.stopLoss ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.takeProfit ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.rr?.toFixed(2) ?? "–"}</TableCell>
                  <TableCell className="space-x-1">
                    {t.setups.map((s) => <Badge key={s} variant="secondary">{label(s)}</Badge>)}
                  </TableCell>
                  <TableCell>{label(t.session)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${t.pnl != null ? tone(t.pnl) : ""}`}>
                    {t.pnl != null ? money(t.pnl) : t.status === "OPEN" ? "Open" : "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ title, value, className = "" }: { title: string; value: string; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${className}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Filter(props: { value: string; onChange: (v: string) => void; placeholder: string; options: string[] }) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="w-40"><SelectValue placeholder={props.placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {props.placeholder.toLowerCase()}s</SelectItem>
        {props.options.map((o) => <SelectItem key={o} value={o}>{label(o)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
