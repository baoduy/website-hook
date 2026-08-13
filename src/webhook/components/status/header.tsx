"use client";

import Link from "next/link";
import { Moon, Sun, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/components/theme";

export function StatusHeader({ updatedAgo }: { updatedAgo: string }) {
  const toggleTheme = () => {
    const root = document.documentElement;
    const isDark = root.classList.toggle("dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
    } catch {
      // ignore
    }
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
        <Terminal className="h-4 w-4" />
      </div>
      <span className="shrink-0 text-sm font-semibold tracking-tight">website·hook</span>
      <span className="shrink-0 rounded px-2 py-0.5 font-mono text-xs font-medium bg-muted text-card-foreground">
        /status
      </span>
      <span className="flex-1" />
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        {updatedAgo}
      </span>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
        <Link href="/">
          <Terminal className="h-3.5 w-3.5" />
          Inspector
        </Link>
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme} title="Toggle theme">
        <Sun className="h-4 w-4 dark:hidden" />
        <Moon className="hidden h-4 w-4 dark:block" />
      </Button>
    </header>
  );
}
