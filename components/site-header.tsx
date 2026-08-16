import Link from "next/link";
import { Flame, Plus } from "lucide-react";

/** Shared top bar: brand home link plus a shortcut to start a new brief. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Flame className="size-4" />
          </span>
          Fire Department Briefs
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
        >
          <Plus className="size-3.5" /> New brief
        </Link>
      </div>
    </header>
  );
}
