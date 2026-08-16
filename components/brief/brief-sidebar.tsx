"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Banknote,
  FileSearch,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  TriangleAlert,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BriefsMap, type BriefPin } from "@/components/briefs-map";
import { useScrollSpy } from "@/lib/hooks/use-scroll-spy";
import { cn } from "@/lib/utils";

export interface SidebarNavItem {
  href: string;
  title: string;
  count: number | null;
}

/** Icon per section anchor; keeps nav items serializable from the server. */
const SECTION_ICONS: Record<string, LucideIcon> = {
  "#why": Sparkles,
  "#leadership": Users,
  "#fleet": Truck,
  "#money": Banknote,
  "#news": Newspaper,
  "#other": Archive,
  "#notes": TriangleAlert,
};

function useActiveHref(navItems: SidebarNavItem[]): string | null {
  const ids = useMemo(
    () => navItems.map((i) => i.href.replace(/^#/, "")),
    [navItems],
  );
  const activeId = useScrollSpy(ids);
  return activeId ? `#${activeId}` : null;
}

/**
 * Desktop sidebar: sticky section nav that highlights the section being
 * read, collapsible to a slim icon rail so the brief can take full width.
 */
export function BriefSidebar({
  navItems,
  sourceCount,
  pin,
}: {
  navItems: SidebarNavItem[];
  sourceCount: number;
  /** Department location for the always-visible regional mini-map. */
  pin?: BriefPin | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const activeHref = useActiveHref(navItems);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 max-h-[calc(100vh-5.5rem)] overflow-y-auto">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border bg-card p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="Show navigation"
              aria-label="Show navigation"
            >
              <PanelLeftOpen className="size-4" />
            </button>
            {navItems.map((item) => {
              const Icon = SECTION_ICONS[item.href] ?? FileSearch;
              const active = item.href === activeHref;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  title={item.title}
                  aria-label={item.title}
                  aria-current={active ? "location" : undefined}
                  className={cn(
                    "rounded-lg p-2 transition",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </a>
              );
            })}
          </div>
        ) : (
          <div className="w-60 space-y-4">
            {navItems.length > 0 && (
              <nav
                aria-label="Brief sections"
                className="rounded-xl border bg-card p-3 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    On this brief
                  </p>
                  <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    title="Hide navigation"
                    aria-label="Hide navigation"
                  >
                    <PanelLeftClose className="size-3.5" />
                  </button>
                </div>
                <ul className="space-y-0.5 text-sm">
                  {navItems.map((item) => {
                    const Icon = SECTION_ICONS[item.href] ?? FileSearch;
                    const active = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          aria-current={active ? "location" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-2 transition",
                            active
                              ? "border-primary bg-primary/8 font-medium text-primary"
                              : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="flex-1 truncate">{item.title}</span>
                          {item.count != null && (
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                                active
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {item.count}
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
            {pin && (
              <div className="overflow-hidden rounded-xl border shadow-sm">
                {/* Regional zoom on purpose: the AE needs "roughly where",
                    not streets. */}
                <BriefsMap
                  interactive={false}
                  zoom={7}
                  className="h-44 min-h-0 rounded-none border-0"
                  pins={[pin]}
                />
              </div>
            )}
            {sourceCount > 0 && (
              <div className="rounded-xl border bg-card p-3.5 text-xs text-muted-foreground shadow-sm">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileSearch className="size-3.5 text-primary" />
                  {sourceCount} sources checked
                </p>
                <p className="mt-1.5 leading-relaxed">
                  Every fact links to its source. Click any citation chip to
                  see the exact quote and open the page.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Mobile in-page nav: horizontal chips under the header; the chip for the
 * section being read stays highlighted and scrolled into view.
 */
export function BriefSectionNav({ navItems }: { navItems: SidebarNavItem[] }) {
  const activeHref = useActiveHref(navItems);
  const navRef = useRef<HTMLElement>(null);

  // Keep the highlighted chip visible as the reader scrolls through sections.
  useEffect(() => {
    if (!activeHref) return;
    navRef.current
      ?.querySelector(`a[href="${CSS.escape(activeHref)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeHref]);

  return (
    <nav
      ref={navRef}
      aria-label="Brief sections"
      className="sticky top-14 z-10 -mx-4 mb-2 flex gap-1.5 overflow-x-auto border-b bg-background/90 px-4 py-2 text-sm backdrop-blur sm:-mx-6 sm:px-6 lg:hidden"
    >
      {navItems.map((item) => {
        const active = item.href === activeHref;
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "location" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1 transition",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.title}
            {item.count != null && (
              <span className="ml-1.5 text-xs tabular-nums opacity-70">
                {item.count}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
