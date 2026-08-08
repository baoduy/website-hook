"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/components/theme";

// The class on <html> is the source of truth — the init script set it before paint, so read it
// rather than keeping a second copy in state that could disagree.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    listeners.forEach((notify) => notify());
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // A blocked storage costs persistence across reloads, not the toggle itself.
    }
  }

  const label = dark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={dark}
    >
      {dark ? <Sun className="size-[15px]" /> : <Moon className="size-[15px]" />}
    </Button>
  );
}
