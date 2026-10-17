import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./cidade/city.css";

const inter = localFont({ src: "./fonts/Inter-Latin.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
const interTight = localFont({ src: "./fonts/InterTight-Latin.woff2", weight: "100 900", variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title: "Pergunta ao INE",
  description: "Os números do Algarve, com o Algarve à vista. Dados oficiais explicados com Gemma 4.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-PT" className={`${inter.variable} ${interTight.variable}`}><body>{children}</body></html>;
}
