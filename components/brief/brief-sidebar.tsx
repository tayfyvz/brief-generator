"use client";

import { useState } from "react";
import { FileSearch, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export interface SidebarNavItem {
  href: string;
  title: string;
  count: number | null;
}

/**
 * Desktop sidebar: sticky section nav + source overview, collapsible to a
 * slim rail so the brief can take the full width when the AE wants it.
 */
export function BriefSidebar({
  navItems,
  sourceCount,
}: {
  navItems: SidebarNavItem[];
  sourceCount: number;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-16 max-h-[calc(100vh-4.5rem)] overflow-y-auto">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-md border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Show navigation"
            aria-label="Show navigation"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        ) : (
          <div className="w-56 space-y-6">
            {navItems.length > 0 && (
              <nav aria-label="Brief sections">
                <div className="mb-2 flex items-center justify-between">
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
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      >
                        {item.title}
                        {item.count != null && (
                          <span className="tabular-nums text-xs">{item.count}</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            {sourceCount > 0 && (
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileSearch className="size-3.5" /> {sourceCount} sources checked
                </p>
                <p className="mt-1.5 leading-relaxed">
                  Every fact links to its source. Click any citation chip to see
                  the exact quote and open the page.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
