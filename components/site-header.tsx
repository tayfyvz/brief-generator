"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, House, LibraryBig } from "lucide-react";
import { useSiteHeaderStore } from "@/lib/stores/header-store";
import { useRunStore } from "@/lib/stores/run-store";
import { cn } from "@/lib/utils";

/**
 * Shared top bar: brand, the current department (set by the brief page),
 * a live-research indicator, contextual nav, and a reading-progress bar.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const title = useSiteHeaderStore((s) => s.title);
  const subtitle = useSiteHeaderStore((s) => s.subtitle);
  const runStatus = useRunStore((s) => s.status);
  const live = runStatus === "starting" || runStatus === "running";
  const [progress, setProgress] = useState(0);

  const onBriefPage = pathname.startsWith("/brief/");

  // Reading progress along the brief; hidden elsewhere.
  useEffect(() => {
    if (!onBriefPage) {
      setProgress(0);
      return;
    }
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [onBriefPage]);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Flame className="size-4" />
          </span>
          <span className={cn(title && "hidden md:inline")}>
            Fire Department Briefs
          </span>
        </Link>

        {title && (
          <>
            <span aria-hidden className="hidden h-5 w-px bg-border md:block" />
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">{title}</p>
                {subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              {live && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <span className="live-dot size-1.5 rounded-full bg-primary" />
                  Live research
                </span>
              )}
            </div>
          </>
        )}

        <nav className="ml-auto flex shrink-0 items-center gap-1.5">
          {pathname !== "/" && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <House className="size-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          )}
          {pathname !== "/briefs" && (
            <Link
              href="/briefs"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <LibraryBig className="size-4" />
              <span className="hidden sm:inline">All briefs</span>
            </Link>
          )}
        </nav>
      </div>

      {onBriefPage && (
        <div aria-hidden className="h-0.5 w-full bg-transparent">
          <div
            className="h-full bg-primary transition-[width] duration-150 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </header>
  );
}
