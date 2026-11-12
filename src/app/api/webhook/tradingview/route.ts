import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { Prisma, Setup, TradingSession } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { formatSignal, sendTelegram, type Signal } from "@/lib/telegram";


/**
 * TradingView alert message (paste into the alert's "Message" box):
 * {
 *   "secret": "<your webhookSecret>",
 *   "symbol": "{{ticker}}", "timeframe": "{{interval}}", "price": {{close}},
 *   "direction": "buy", "entry": 1.0850, "sl": 1.0820, "tp": [1.0910, 1.0950],
 *   "setup": "FVG", "smt": { "against": "DXY", "bias": "BULLISH" },
 *   "remark": "London sweep + MSS", "journal": true
 * }
 * TradingView can't send custom headers, so the secret travels in the body.
 */
const n = z.coerce.number().finite();
const schema = z.object({
  secret: z.string().min(10),
  symbol: z.string().min(1).max(32).transform((s) => s.toUpperCase().replace(/^.*:/, "")),
  timeframe: z.string().max(8).optional(),
  price: n.optional(),
  direction: z
    .preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), z.enum(["BUY", "SELL"]))
    .optional(),
  entry: n.optional(),
  sl: n.optional(),
  tp: z.union([n, z.array(n)]).optional(),
  setup: z.string().max(40).optional(),
  smt: z.object({ against: z.string().max(16), bias: z.enum(["BULLISH", "BEARISH"]) }).optional(),
  remark: z.string().max(280).optional(),
  journal: z.boolean().optional(), // auto-create an OPEN trade
});

const SETUPS = Object.values(Setup) as string[];
const toSetup = (s?: string) => {
  const k = s?.toUpperCase().replace(/[\s-]+/g, "_");
  return k && SETUPS.includes(k) ? (k as Setup) : undefined;
};

// Approximate UTC windows. Adjust to your own killzones.
function sessionNow(d = new Date()): TradingSession {
  const h = d.getUTCHours();
  if (h >= 7 && h < 12) return "LONDON";
  if (h >= 12 && h < 21) return "NEW_YORK";
  return "ASIA";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text(); // TradingView often sends text/plain
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    await prisma.webhookLog.create({
      data: { status: "REJECTED", rawBody: rawBody.slice(0, 4000), error: "Invalid JSON", ip },
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    await prisma.webhookLog.create({
      data: {
        status: "REJECTED",
        rawBody: rawBody.slice(0, 4000),
        error: parsed.error.message.slice(0, 500),
        ip,
      },
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { secret, ...p } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { webhookSecret: secret },
    include: { telegramConfig: true },
  });
  if (!user) {
    await prisma.webhookLog.create({ data: { status: "REJECTED", error: "Unknown secret", ip } });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency: collapse identical bodies received within the same minute (TradingView retries)
  const dedupeKey = createHash("sha256")
    .update(rawBody + Math.floor(Date.now() / 60_000))
    .digest("hex");

  let log;
  try {
    log = await prisma.webhookLog.create({
      data: {
        userId: user.id,
        dedupeKey,
        symbol: p.symbol,
        timeframe: p.timeframe,
        payload: { ...p } as Prisma.InputJsonValue,
        ip,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw e;
  }

  try {
    const tps = p.tp == null ? [] : Array.isArray(p.tp) ? p.tp : [p.tp];
    const entry = p.entry ?? p.price;
    const rr =
      entry != null && p.sl != null && tps[0] != null && entry !== p.sl
        ? Math.abs(tps[0] - entry) / Math.abs(entry - p.sl)
        : undefined;
    const session = sessionNow();

    // 1) Auto-journal
    let tradeId: string | undefined;
    if (p.journal && p.direction && entry != null) {
      const setup = toSetup(p.setup);
      const trade = await prisma.trade.create({
        data: {
          userId: user.id,
          pair: p.symbol,
          timeframe: p.timeframe,
          direction: p.direction,
          source: "WEBHOOK",
          entry,
          stopLoss: p.sl,
          takeProfit: tps[0],
          rr,
          session,
          setups: [...(setup ? [setup] : []), ...(p.smt ? ["SMT_DIVERGENCE" as const] : [])],
          notes: p.remark,
          smt: p.smt
            ? {
                create: {
                  primarySymbol: p.symbol,
                  correlatedSymbol: p.smt.against,
                  bias: p.smt.bias,
                  timeframe: p.timeframe,
                },
              }
            : undefined,
        },
      });
      tradeId = trade.id;
    }

    // 2) Telegram forward
    let telegramSent = false;
    const tg = user.telegramConfig;
    if (tg?.enabled && tg.forwardWebhooks) {
      const signal: Signal = {
        symbol: p.symbol,
        timeframe: p.timeframe,
        direction: p.direction,
        setup: p.setup,
        session: session.replace("_", " "),
        entry,
        stopLoss: p.sl,
        takeProfit: tps,
        rr,
        smt: p.smt,
        remark: p.remark,
      };
      await sendTelegram({
        botToken: decrypt(tg.botTokenEnc),
        chatId: tg.chatId,
        threadId: tg.threadId,
        text: formatSignal(signal),
      });
      telegramSent = true;
    }

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "PROCESSED", telegramSent, tradeId },
    });
    return NextResponse.json({ ok: true, tradeId, telegramSent });
  } catch (err) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: String(err).slice(0, 500) },
    });
    // Return 200 so TradingView doesn't retry-storm; the failure is visible in WebhookLog
    return NextResponse.json({ ok: false, error: "Processing failed" }, { status: 200 });
  }
}
