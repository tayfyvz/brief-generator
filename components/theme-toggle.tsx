"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Light/dark switch. The current theme lives as a `.dark` class on <html>,
 * applied before paint by the inline script in the root layout; this button
 * just flips the class and persists the choice.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      title="Toggle dark mode"
      aria-label="Toggle dark mode"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", dark ? "dark" : "light");
      }}
      className="inline-flex items-center rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  );
}
