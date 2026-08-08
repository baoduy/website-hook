import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/components/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "website·hook — Capture inspector",
  description: "Create capture webhooks and inspect the requests they receive.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The init script mutates <html>'s class before hydration, which is exactly what
    // suppressHydrationWarning exists for.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script>{THEME_INIT_SCRIPT}</script>
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
