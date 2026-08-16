import Link from "next/link";
import {
  Archive,
  Banknote,
  FileSearch,
  Globe,
  ListChecks,
  Newspaper,
  Phone,
  Scale,
  Sparkles,
  TriangleAlert,
  Truck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  BriefSectionNav,
  BriefSidebar,
  type SidebarNavItem,
} from "@/components/brief/brief-sidebar";
import { BriefPending } from "@/components/brief/brief-pending";
import { CopyBriefButton } from "@/components/brief/copy-brief-button";
import { BriefsMap } from "@/components/briefs-map";
import { briefToMarkdown } from "@/lib/brief-text";
import { FactSection } from "@/components/brief/fact-section";
import { FactSearch } from "@/components/brief/fact-search";
import { HeaderTitle } from "@/components/brief/header-title";
import { ResearchController } from "@/components/run/research-controller";
import type { FactRow, SourceRow } from "@/components/brief/fact-card";
import {
  getBriefPageData,
  getDepartment,
  getLatestRun,
  getRunWarnings,
} from "@/lib/db/queries";
import { getRunManager } from "@/lib/research/run-manager";
import { getEnv } from "@/lib/env";
import { placeIdSchema } from "@/lib/schemas/anchor";
import {
  MAX_CURATED_PER_SECTION,
  SECTION_CATEGORIES,
  briefContentSchema,
  type BriefContent,
  type BriefSectionKey,
} from "@/lib/schemas/brief";
import { formatDate } from "@/lib/format";
import type { Warning } from "@/lib/schemas/tools";

export const dynamic = "force-dynamic";

const SECTIONS: {
  key: BriefSectionKey;
  title: string;
  icon: typeof Users;
  emptyNote: string;
}[] = [
  {
    key: "leadership",
    title: "Who to call",
    icon: Users,
    emptyNote: "No verified leadership or contact information found in this run.",
  },
  {
    key: "fleet",
    title: "What they drive",
    icon: Truck,
    emptyNote: "No verified apparatus information found in this run.",
  },
  {
    key: "money",
    title: "Money moving",
    icon: Banknote,
    emptyNote: "No verified budget, grant, or procurement activity found in this run.",
  },
  {
    key: "news",
    title: "Recent signals",
    icon: Newspaper,
    emptyNote: "No verified recent news found in this run.",
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  const parsed = placeIdSchema.safeParse(placeId);
  if (!parsed.success) return { title: "Brief" };
  const department = await getDepartment(parsed.data).catch(() => null);
  return {
    title: department ? `${department.name} · Brief` : "Brief",
  };
}

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
    const categories = SECTION_CATEGORIES[section.key];
    const curated = (content?.curatedFactIds[section.key] ?? [])
      .map((id) => factById.get(id))
      .filter((f): f is FactRow => Boolean(f))
      .filter((f) => categories.includes(f.category))
      .filter((f) => !usedIds.has(f.id) && (usedIds.add(f.id), true))
      .slice(0, MAX_CURATED_PER_SECTION);
    const curatedIds = new Set(curated.map((f) => f.id));
    const rest = facts.filter(
      (f) => categories.includes(f.category) && !curatedIds.has(f.id),
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

  const resolvedName =
    department && department.name !== "(resolving…)" ? department.name : null;
  const location = department
    ? [department.city, department.state].filter(Boolean).join(", ")
    : "";

  // One clipboard-ready markdown rendition of exactly what the page shows.
  const copyText =
    content && department && brief
      ? briefToMarkdown({
          name: department.name,
          location,
          address: department.address,
          phone: department.phone,
          website: department.website,
          researchedAt: brief.createdAt,
          summary: content.summary,
          whyCallToday: content.whyCallToday,
          sections: sectionData.map((s) => ({
            title: s.title,
            emptyNote: s.emptyNote,
            facts: [...s.curated, ...s.rest].map((f) => ({
              claim: f.claim,
              sourceUrl: sourceById[f.sourceId]?.url,
            })),
          })),
          notes: [
            ...(capsHit.length > 0
              ? [`Run budget reached (${capsHit.join(", ")}); coverage may be partial.`]
              : []),
            ...content.caveats,
            ...warnings.map((w) => `[${w.scope}] ${w.message}`),
          ],
        })
      : null;

  return (
    // No items-start on the grid: the sidebar item must stretch to the full
    // column height so its sticky nav stays visible while scrolling.
    <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8 lg:px-8">
      {resolvedName && <HeaderTitle title={resolvedName} subtitle={location} />}
      <BriefSidebar navItems={navItems} sourceCount={sources.length} />

      <div className="min-w-0">
        {/* Department identity: name + address left, contact & stats right.
            Run controls (Update / Start fresh) live in the site header. */}
        <header className="border-b pb-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {resolvedName ?? "Researching department…"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {department?.address && (
                  <span className="text-muted-foreground">{department.address}</span>
                )}
                {!department && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {placeId}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {department?.phone && (
                <a
                  href={`tel:${department.phone}`}
                  className="chip-hover inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium"
                >
                  <Phone className="size-3.5 text-primary" /> {department.phone}
                </a>
              )}
              {department?.website && (
                <a
                  href={department.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip-hover inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium"
                >
                  <Globe className="size-3.5 text-primary" />
                  {new URL(department.website).hostname.replace(/^www\./, "")}
                </a>
              )}
              {copyText && <CopyBriefButton text={copyText} />}
              {content && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="size-3.5" /> {facts.length} facts
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <FileSearch className="size-3.5" /> {sources.length} sources
                  </span>
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Compact location map; static on purpose, the library map explores */}
        {content && department?.lat != null && department?.lng != null && (
          <div className="fade-up mt-5">
            <BriefsMap
              interactive={false}
              className="h-36 min-h-0 sm:h-40"
              pins={[
                {
                  placeId,
                  name: department.name,
                  city: department.city,
                  state: department.state,
                  lat: department.lat,
                  lng: department.lng,
                },
              ]}
            />
          </div>
        )}

        {/* Live-run panel (only while a run streams or after a failure) */}
        <ResearchController
          placeId={placeId}
          hasBrief={Boolean(brief)}
          researchedAt={brief ? brief.createdAt.toISOString() : null}
          activeRunId={activeRunId}
          interruptedRunId={interruptedRunId}
          maxRounds={maxRounds}
        />

        {content ? (
          <>
            {/* Mobile in-page nav with reading highlight */}
            <BriefSectionNav navItems={navItems} />

            <FactSearch placeId={placeId} />

            {/* Summary spans the full content column so it reflows when the
                sidebar collapses instead of sitting in a fixed-width block */}
            {content.summary && (
              <div className="fade-up mt-5 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3.5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  At a glance
                </p>
                <p className="text-[15px] leading-relaxed lg:text-base">
                  {content.summary}
                </p>
              </div>
            )}

            {/* Why call today */}
            {content.whyCallToday.length > 0 && (
              <section id="why" className="section-anchor mt-8">
                <SectionHeading icon={Sparkles} title="Why call today" />
                <ol className="grid gap-3 xl:grid-cols-3">
                  {content.whyCallToday.map((signal, i) => (
                    <li
                      key={i}
                      className="fade-up flex gap-4 rounded-xl border-l-4 border-primary bg-card p-4 shadow-sm"
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold tabular-nums text-primary-foreground">
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
                          <p className="mt-1.5 text-xs font-medium text-primary/80">
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
              <section className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
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
              return (
                <section key={section.key} id={section.key} className="section-anchor mt-9">
                  <SectionHeading
                    icon={section.icon}
                    title={section.title}
                    count={section.count}
                  />
                  {section.count > 0 ? (
                    <FactSection
                      curated={section.curated}
                      rest={section.rest}
                      sources={sourceById}
                    />
                  ) : (
                    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      {section.emptyNote}
                    </p>
                  )}
                </section>
              );
            })}

            {/* Also found: background findings, collapsed by default */}
            {otherFacts.length > 0 && (
              <section id="other" className="section-anchor mt-9">
                <SectionHeading
                  icon={Archive}
                  title="Also found"
                  count={otherFacts.length}
                />
                <p className="-mt-1 mb-2.5 text-xs text-muted-foreground">
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
              <section id="notes" className="section-anchor mt-9 rounded-xl border border-dashed p-4">
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
          <BriefPending />
        )}
      </div>
    </main>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Users;
  title: string;
  count?: number;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5">
      <span className="icon-tile size-7">
        <Icon className="size-4" />
      </span>
      <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
      {count != null && (
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      )}
    </h2>
  );
}

function EmptyState({ title, note }: { title: string; note: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{note}</p>
      <Link
        href="/"
        className="chip-hover rounded-lg border bg-card px-4 py-2 text-sm font-medium"
      >
        Back to home
      </Link>
    </main>
  );
}
