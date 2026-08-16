import Link from "next/link";
import {
  Banknote,
  Globe,
  Newspaper,
  Phone,
  Scale,
  Sparkles,
  TriangleAlert,
  Truck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BriefSidebar, type SidebarNavItem } from "@/components/brief/brief-sidebar";
import { FactSection } from "@/components/brief/fact-section";
import { FactSearch } from "@/components/brief/fact-search";
import { ResearchController } from "@/components/run/research-controller";
import type { FactRow, SourceRow } from "@/components/brief/fact-card";
import {
  getBriefPageData,
  getLatestRun,
  getRunWarnings,
} from "@/lib/db/queries";
import { getRunManager } from "@/lib/research/run-manager";
import { getEnv } from "@/lib/env";
import { placeIdSchema } from "@/lib/schemas/anchor";
import { briefContentSchema, type BriefContent } from "@/lib/schemas/brief";
import { formatDate } from "@/lib/format";
import type { Warning } from "@/lib/schemas/tools";

export const dynamic = "force-dynamic";

const MAX_CURATED_PER_SECTION = 5;

const SECTIONS: {
  key: "leadership" | "fleet" | "money" | "news";
  title: string;
  categories: string[];
  icon: typeof Users;
  emptyNote: string;
}[] = [
  {
    key: "leadership",
    title: "Who to call",
    categories: ["leadership"],
    icon: Users,
    emptyNote: "No verified leadership or contact information found in this run.",
  },
  {
    key: "fleet",
    title: "What they drive",
    categories: ["fleet"],
    icon: Truck,
    emptyNote: "No verified apparatus information found in this run.",
  },
  {
    key: "money",
    title: "Money moving",
    categories: ["procurement", "funding"],
    icon: Banknote,
    emptyNote: "No verified budget, grant, or procurement activity found in this run.",
  },
  {
    key: "news",
    title: "Recent signals",
    categories: ["news"],
    icon: Newspaper,
    emptyNote: "No verified recent news found in this run.",
  },
];

export default async function BriefPage({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId: raw } = await params;
  const parsed = placeIdSchema.safeParse(raw);
  if (!parsed.success) {
    return (
      <EmptyState title="Invalid Place ID" note="That doesn't look like a Google Place ID." />
    );
  }
  const placeId = parsed.data;

  const data = await getBriefPageData(placeId);
  const latestRun = await getLatestRun(placeId);
  const activeRunId = getRunManager().activeRunFor(placeId);
  const interruptedRunId =
    !activeRunId && latestRun?.status === "interrupted" ? latestRun.id : null;
  const maxRounds = getEnv().MAX_ROUNDS;

  const department = data?.department ?? null;
  const brief = data?.brief ?? null;
  const facts = data?.facts ?? [];
  const sources = data?.sources ?? [];
  const content: BriefContent | null = brief
    ? briefContentSchema.parse(brief.content)
    : null;
  const warnings: Warning[] = brief ? await getRunWarnings(brief.runId) : [];
  const capsHit =
    brief && latestRun?.id === brief.runId ? (latestRun.capsHit ?? []) : [];

  const sourceById: Record<string, SourceRow> = Object.fromEntries(
    sources.map((s) => [s.id, s]),
  );
  const factById = new Map<string, FactRow>(facts.map((f) => [f.id, f]));

  // Render-time curation invariants (also enforced at synthesis; applying
  // them here fixes briefs generated before the rule existed): a section
  // only shows facts of its own categories, each fact renders in at most
  // one section, and curated picks stay short.
  const usedIds = new Set<string>();
  const sectionData = SECTIONS.map((section) => {
    const curated = (content?.curatedFactIds[section.key] ?? [])
      .map((id) => factById.get(id))
      .filter((f): f is FactRow => Boolean(f))
      .filter((f) => section.categories.includes(f.category))
      .filter((f) => !usedIds.has(f.id) && (usedIds.add(f.id), true))
      .slice(0, MAX_CURATED_PER_SECTION);
    const curatedIds = new Set(curated.map((f) => f.id));
    const rest = facts.filter(
      (f) => section.categories.includes(f.category) && !curatedIds.has(f.id),
    );
    return { ...section, curated, rest, count: curated.length + rest.length };
  });
  const otherFacts = facts.filter((f) => f.category === "other");
  const hasNotes =
    (content?.caveats.length ?? 0) > 0 || warnings.length > 0 || capsHit.length > 0;

  const navItems: SidebarNavItem[] = content
    ? [
        { href: "#why", title: "Why call today", count: null },
        ...sectionData.map((s) => ({
          href: `#${s.key}`,
          title: s.title,
          count: s.count,
        })),
        ...(otherFacts.length > 0
          ? [{ href: "#other", title: "Also found", count: otherFacts.length }]
          : []),
        ...(hasNotes
          ? [{ href: "#notes", title: "Research notes", count: null }]
          : []),
      ]
    : [];

  return (
    // No items-start on the grid: the sidebar item must stretch to the full
    // column height so its sticky nav stays visible while scrolling.
    <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8 lg:px-8">
      <BriefSidebar navItems={navItems} sourceCount={sources.length} />

      <div className="min-w-0">
        {/* Compact header: identity left, actions right, live run full-width */}
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b pb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {department && department.name !== "(resolving…)"
                ? department.name
                : "Researching department…"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {department?.address && <span>{department.address}</span>}
              {department?.phone && (
                <a
                  href={`tel:${department.phone}`}
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                >
                  <Phone className="size-3.5" /> {department.phone}
                </a>
              )}
              {department?.website && (
                <a
                  href={department.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                >
                  <Globe className="size-3.5" />
                  {new URL(department.website).hostname}
                </a>
              )}
              {!department && <span className="font-mono text-xs">{placeId}</span>}
            </div>
          </div>
          <ResearchController
            placeId={placeId}
            hasBrief={Boolean(brief)}
            researchedAt={brief ? brief.createdAt.toISOString() : null}
            activeRunId={activeRunId}
            interruptedRunId={interruptedRunId}
            maxRounds={maxRounds}
          />
        </header>

        {content ? (
          <>
            {/* Mobile in-page nav */}
            <nav className="sticky top-14 z-10 -mx-4 mb-2 flex gap-1 overflow-x-auto border-b bg-background/90 px-4 py-2 text-sm backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-full px-3 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  {item.title}
                </a>
              ))}
            </nav>

            {/* Summary spans the full content column so it reflows when the
                sidebar collapses instead of sitting in a fixed-width block */}
            {content.summary && (
              <p className="mt-5 w-full rounded-lg bg-muted/50 px-4 py-3 text-[15px] leading-relaxed lg:text-base">
                {content.summary}
              </p>
            )}

            <FactSearch placeId={placeId} />

            {/* Why call today */}
            {content.whyCallToday.length > 0 && (
              <section id="why" className="mt-8 scroll-mt-24">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-4" /> Why call today
                </h2>
                <ol className="grid gap-3 xl:grid-cols-3">
                  {content.whyCallToday.map((signal, i) => (
                    <li
                      key={i}
                      className="flex gap-4 rounded-lg border-l-4 border-primary bg-card p-4 shadow-sm"
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium leading-snug">{signal.headline}</p>
                        {signal.detail && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {signal.detail}
                          </p>
                        )}
                        {signal.date && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(signal.date)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Genuine conflicts: surfaced, never silently resolved */}
            {content.conflicts.length > 0 && (
              <section className="mt-8 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  <Scale className="size-4" /> Conflicting information
                </h2>
                <ul className="space-y-3 text-sm">
                  {content.conflicts.map((c, i) => (
                    <li key={i}>
                      <p className="font-medium">{c.topic}</p>
                      <p className="text-muted-foreground">{c.note}</p>
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                        {c.factIds.map((id) => {
                          const f = factById.get(id);
                          return f ? <li key={id}>{f.claim}</li> : null;
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Four sections; an empty section says so honestly */}
            {sectionData.map((section) => {
              const Icon = section.icon;
              return (
                <section key={section.key} id={section.key} className="mt-8 scroll-mt-24">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="size-4" /> {section.title}
                    <Badge variant="secondary">{section.count}</Badge>
                  </h2>
                  {section.count > 0 ? (
                    <FactSection
                      curated={section.curated}
                      rest={section.rest}
                      sources={sourceById}
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {section.emptyNote}
                    </p>
                  )}
                </section>
              );
            })}

            {/* Also found: background findings, collapsed by default */}
            {otherFacts.length > 0 && (
              <section id="other" className="mt-8 scroll-mt-24">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Also found
                  <Badge variant="secondary">{otherFacts.length}</Badge>
                </h2>
                <p className="mb-2 text-xs text-muted-foreground">
                  Background findings that did not fit the main sections.
                </p>
                <FactSection
                  curated={[]}
                  rest={otherFacts}
                  sources={sourceById}
                  collapsedByDefault
                />
              </section>
            )}

            {/* Honest research notes: caveats, caps, degraded tracks */}
            {hasNotes && (
              <section id="notes" className="mt-8 scroll-mt-24 rounded-lg border border-dashed p-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <TriangleAlert className="size-4" /> Research notes
                </h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {capsHit.length > 0 && (
                    <li>
                      Run budget reached ({capsHit.join(", ")}); coverage may be
                      partial.
                    </li>
                  )}
                  {content.caveats.map((c, i) => (
                    <li key={`caveat-${i}`}>{c}</li>
                  ))}
                  {warnings.map((w, i) => (
                    <li key={`warning-${i}`}>
                      <span className="font-mono text-xs">[{w.scope}]</span> {w.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">
            No brief yet. Research starts automatically and results will appear
            here the moment it finishes.
          </p>
        )}
      </div>
    </main>
  );
}

function EmptyState({ title, note }: { title: string; note: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{note}</p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
    </main>
  );
}
