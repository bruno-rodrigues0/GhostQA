import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Bunter | Mission Control",
  description: "Auditoria comportamental de UX com personas sintéticas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={cn("dark h-full antialiased font-sans", geist.variable)}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
