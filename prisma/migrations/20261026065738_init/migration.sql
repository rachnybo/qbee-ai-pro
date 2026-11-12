-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('MANUAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "TradingSession" AS ENUM ('ASIA', 'LONDON', 'NEW_YORK');

-- CreateEnum
CREATE TYPE "Setup" AS ENUM ('FVG', 'ORDER_BLOCK', 'BREAKER_BLOCK', 'LIQUIDITY_SWEEP', 'MSS', 'SMT_DIVERGENCE');

-- CreateEnum
CREATE TYPE "PsychTag" AS ENUM ('DISCIPLINED', 'FOMO', 'PATIENT', 'REVENGE', 'HESITANT');

-- CreateEnum
CREATE TYPE "SmtBias" AS ENUM ('BULLISH', 'BEARISH');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "JournalPeriod" AS ENUM ('DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT,
    "direction" "Direction" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "source" "TradeSource" NOT NULL DEFAULT 'MANUAL',
    "entry" DECIMAL(18,5) NOT NULL,
    "exit" DECIMAL(18,5),
    "stopLoss" DECIMAL(18,5),
    "takeProfit" DECIMAL(18,5),
    "riskPercent" DOUBLE PRECISION,
    "rr" DOUBLE PRECISION,
    "rMultiple" DOUBLE PRECISION,
    "pnl" DECIMAL(14,2),
    "session" "TradingSession" NOT NULL,
    "setups" "Setup"[],
    "psychTags" "PsychTag"[],
    "notes" TEXT,
    "screenshotUrls" TEXT[],
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmtDivergence" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "primarySymbol" TEXT NOT NULL,
    "correlatedSymbol" TEXT NOT NULL,
    "bias" "SmtBias" NOT NULL,
    "timeframe" TEXT,
    "note" TEXT,

    CONSTRAINT "SmtDivergence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" "JournalPeriod" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "aiReview" JSONB,
    "aiScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "dedupeKey" TEXT,
    "symbol" TEXT,
    "timeframe" TEXT,
    "payload" JSONB,
    "rawBody" TEXT,
    "error" TEXT,
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "tradeId" TEXT,
    "ip" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botTokenEnc" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "threadId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "forwardWebhooks" BOOLEAN NOT NULL DEFAULT true,
    "forwardAiSetups" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_webhookSecret_key" ON "User"("webhookSecret");

-- CreateIndex
CREATE INDEX "Trade_userId_openedAt_idx" ON "Trade"("userId", "openedAt");

-- CreateIndex
CREATE INDEX "Trade_userId_pair_idx" ON "Trade"("userId", "pair");

-- CreateIndex
CREATE INDEX "Trade_userId_session_idx" ON "Trade"("userId", "session");

-- CreateIndex
CREATE UNIQUE INDEX "SmtDivergence_tradeId_key" ON "SmtDivergence"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_userId_period_periodStart_key" ON "Journal"("userId", "period", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookLog_tradeId_key" ON "WebhookLog"("tradeId");

-- CreateIndex
CREATE INDEX "WebhookLog_userId_receivedAt_idx" ON "WebhookLog"("userId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookLog_userId_dedupeKey_key" ON "WebhookLog"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConfig_userId_key" ON "TelegramConfig"("userId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmtDivergence" ADD CONSTRAINT "SmtDivergence_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConfig" ADD CONSTRAINT "TelegramConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
