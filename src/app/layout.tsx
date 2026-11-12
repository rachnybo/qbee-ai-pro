import type { Metadata } from "next";
import { Inter, Noto_Sans_Khmer } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const khmer = Noto_Sans_Khmer({ subsets: ["khmer"], variable: "--font-khmer" });

export const metadata: Metadata = {
  title: "ICT Hub | Market, Signals & Journal",
  description: "TradingView charts, ICT/SMC signal scanner and trading journal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${khmer.variable}`} suppressHydrationWarning>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        style={{ fontFamily: "var(--font-inter), var(--font-khmer), ui-sans-serif, system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
