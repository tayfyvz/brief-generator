"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, House, LibraryBig, RefreshCw, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSiteHeaderStore } from "@/lib/stores/header-store";
import { useRunStore } from "@/lib/stores/run-store";
import { relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shared top bar. On a brief page: brand left, department name centered,
 * run controls (Update / Start fresh / Resume) to the right of it, and a
 * reading-progress bar underneath.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const title = useSiteHeaderStore((s) => s.title);
  const subtitle = useSiteHeaderStore((s) => s.subtitle);
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
        {/* Left zone: brand */}
        <div className="flex flex-1 basis-0 items-center">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Flame className="size-4" />
            </span>
            <span className={cn(title && "hidden xl:inline")}>
              Fire Department Briefs
            </span>
          </Link>
        </div>

        {/* Center zone: the department being read */}
        {title && (
          <div className="min-w-0 text-center leading-tight">
            <p className="truncate text-sm font-semibold">{title}</p>
            {subtitle && (
              <p className="truncate text-[11px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Right zone: run controls, then site nav */}
        <div className="flex flex-1 basis-0 items-center justify-end gap-1.5">
          <HeaderRunActions />
          <nav className="flex shrink-0 items-center gap-1">
            {pathname !== "/" && (
              <Link
                href="/"
                title="Home"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <House className="size-4" />
                <span className={cn("hidden", !title && "sm:inline")}>Home</span>
              </Link>
            )}
            {pathname !== "/briefs" && (
              <Link
                href="/briefs"
                title="All briefs"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <LibraryBig className="size-4" />
                <span className={cn("hidden", !title && "sm:inline")}>
                  All briefs
                </span>
              </Link>
            )}
            <ThemeToggle />
          </nav>
        </div>
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

/**
 * Update / Start fresh / Resume for the brief being viewed; shows a live
 * badge instead while a run streams. Present only when a brief page has
 * published its context into the run store.
 */
function HeaderRunActions() {
  const ctx = useRunStore((s) => s.briefCtx);
  const status = useRunStore((s) => s.status);
  const startResearch = useRunStore((s) => s.startResearch);

  if (!ctx) return null;
  const live = status === "starting" || status === "running";

  if (live) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <span className="live-dot size-1.5 rounded-full bg-primary" />
        <span className="hidden sm:inline">Researching live</span>
        <span className="sm:hidden">Live</span>
      </span>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {ctx.researchedAt && (
        <span className="hidden text-xs text-muted-foreground lg:inline">
          Updated {relativeDays(ctx.researchedAt)}
        </span>
      )}
      {ctx.interruptedRunId && (
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          title="Continue the interrupted run where it left off."
          onClick={() =>
            void startResearch({ resumeRunId: ctx.interruptedRunId! })
          }
        >
          <Play className="size-3" />
          <span className="hidden sm:inline">Resume</span>
        </Button>
      )}
      {(ctx.hasBrief || status === "done" || status === "failed") && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            title="Rerun research, keeping every verified fact from the last run and spending the budget on gaps."
            onClick={() => void startResearch({ placeId: ctx.placeId })}
          >
            <RefreshCw className="size-3" />
            <span className="hidden sm:inline">Update</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
            title="Rerun from scratch without carrying forward previous facts (prior runs stay in the database)."
            onClick={() =>
              void startResearch({ placeId: ctx.placeId, fresh: true })
            }
          >
            <RotateCcw className="size-3" />
            <span className="hidden md:inline">Start fresh</span>
          </Button>
        </>
      )}
    </div>
  );
}
