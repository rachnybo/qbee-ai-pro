export type Signal = {
  symbol: string;
  timeframe?: string;
  direction?: "BUY" | "SELL";
  setup?: string;
  session?: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number[];
  rr?: number;
  smt?: { against: string; bias: string };
  remark?: string;
};

// MarkdownV2 requires these characters to be escaped in plain text
const esc = (s: string | number) =>
  String(s).replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, "\\$&");

export function formatSignal(s: Signal) {
  const dir =
    s.direction === "BUY" ? "🟢 *BUY*" : s.direction === "SELL" ? "🔴 *SELL*" : "🔔 *ALERT*";
  const lines = [`${dir}  \`${esc(s.symbol)}\`${s.timeframe ? `  ·  ${esc(s.timeframe)}` : ""}`];
  if (s.setup) lines.push(`🧩 *Setup:* ${esc(s.setup)}`);
  if (s.smt) lines.push(`🔀 *SMT:* vs ${esc(s.smt.against)} \\(${esc(s.smt.bias)}\\)`);
  if (s.session) lines.push(`🕒 *Session:* ${esc(s.session)}`);
  lines.push("");
  if (s.entry != null) lines.push(`🎯 *Entry:* \`${esc(s.entry)}\``);
  if (s.stopLoss != null) lines.push(`🛑 *SL:* \`${esc(s.stopLoss)}\``);
  s.takeProfit?.forEach((tp, i) => lines.push(`✅ *TP${i + 1}:* \`${esc(tp)}\``));
  if (s.rr != null) lines.push(`⚖️ *R:R:* ${esc(s.rr.toFixed(2))}`);
  if (s.remark) lines.push("", `📝 _${esc(s.remark)}_`);
  return lines.join("\n");
}

export async function sendTelegram(opts: {
  botToken: string;
  chatId: string;
  threadId?: number | null;
  text: string;
}) {
  const res = await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: opts.chatId,
      message_thread_id: opts.threadId ?? undefined,
      text: opts.text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}
