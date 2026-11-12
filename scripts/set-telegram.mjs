import { PrismaClient } from "@prisma/client";
import { createCipheriv, randomBytes } from "crypto";

const { TG_TOKEN, TG_CHAT, ENCRYPTION_KEY } = process.env;
if (!TG_TOKEN || !TG_CHAT) throw new Error("Set TG_TOKEN and TG_CHAT");

const iv = randomBytes(12);
const c = createCipheriv("aes-256-gcm", Buffer.from(ENCRYPTION_KEY, "base64"), iv);
const enc = Buffer.concat([c.update(TG_TOKEN, "utf8"), c.final()]);
const botTokenEnc = [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");

const p = new PrismaClient();
const user = await p.user.findUnique({ where: { authId: "test-user" } });
await p.telegramConfig.upsert({
  where: { userId: user.id },
  update: { botTokenEnc, chatId: TG_CHAT, enabled: true },
  create: { userId: user.id, botTokenEnc, chatId: TG_CHAT },
});
console.log("Saved");
await p.$disconnect();
