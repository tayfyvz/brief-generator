import Link from "next/link";
import {
  ArrowLeft,
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

const SECTIONS: {
  key: "leadership" | "fleet" | "money" | "news";
  title: string;
  categories: string[];
  icon: typeof Users;
}[] = [
  { key: "leadership", title: "Who to call", categories: ["leadership"], icon: Users },
  { key: "fleet", title: "What they drive", categories: ["fleet"], icon: Truck },
  {
    key: "money",
    title: "Money moving",
    categories: ["procurement", "funding"],
    icon: Banknote,
  },
  { key: "news", title: "Recent signals", categories: ["news"], icon: Newspaper },
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

  const controller = (
    <ResearchController
      placeId={placeId}
      hasBrief={Boolean(brief)}
      researchedAt={brief ? brief.createdAt.toISOString() : null}
      activeRunId={activeRunId}
      interruptedRunId={interruptedRunId}
      maxRounds={maxRounds}
    />
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All briefs
      </Link>

      {/* Header (instant) */}
      <header className="border-b pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {department && department.name !== "(resolving…)"
            ? department.name
            : "Researching department…"}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
        {controller}
      </header>

      {content ? (
        <>
          {/* Sticky in-page nav */}
          <nav className="sticky top-0 z-10 -mx-6 mb-2 flex gap-1 overflow-x-auto border-b bg-background/90 px-6 py-2 text-sm backdrop-blur">
            {[{ key: "why", title: "Why call" }, ...SECTIONS].map((s) => (
              <a
                key={s.key}
                href={`#${s.key}`}
                className="whitespace-nowrap rounded-full px-3 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {s.title}
              </a>
            ))}
          </nav>

          {content.summary && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {content.summary}
            </p>
          )}

          <FactSearch placeId={placeId} />

          {/* Why call today */}
          {content.whyCallToday.length > 0 && (
            <section id="why" className="mt-8 scroll-mt-14">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-4" /> Why call today
              </h2>
              <ol className="grid gap-3">
                {content.whyCallToday.map((signal, i) => (
                  <li
                    key={i}
                    className="rounded-lg border-l-4 border-primary bg-card p-4 shadow-sm"
                  >
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
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Conflicts — surfaced, never silently resolved */}
          {content.conflicts.length > 0 && (
            <section className="mt-8 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
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

          {/* Four sections */}
          {SECTIONS.map((section) => {
            const curated = (content.curatedFactIds[section.key] ?? [])
              .map((id) => factById.get(id))
              .filter((f): f is FactRow => Boolean(f));
            const curatedIds = new Set(curated.map((f) => f.id));
            const rest = facts.filter(
              (f) =>
                section.categories.includes(f.category) && !curatedIds.has(f.id),
            );
            if (curated.length + rest.length === 0) return null;
            const Icon = section.icon;
            return (
              <section key={section.key} id={section.key} className="mt-8 scroll-mt-14">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-4" /> {section.title}
                  <Badge variant="secondary">{curated.length + rest.length}</Badge>
                </h2>
                <FactSection curated={curated} rest={rest} sources={sourceById} />
              </section>
            );
          })}

          {/* Also found */}
          {facts.some((f) => f.category === "other") && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Also found
              </h2>
              <FactSection
                curated={[]}
                rest={facts.filter((f) => f.category === "other")}
                sources={sourceById}
              />
            </section>
          )}

          {/* Honest research notes: caveats, caps, degraded tracks */}
          {(content.caveats.length > 0 || warnings.length > 0 || capsHit.length > 0) && (
            <section className="mt-8 rounded-lg border border-dashed p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <TriangleAlert className="size-4" /> Research notes
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {capsHit.length > 0 && (
                  <li>Run budget reached ({capsHit.join(", ")}) — coverage may be partial.</li>
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
          No brief yet — research starts automatically and results will appear
          here the moment it finishes.
        </p>
      )}
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
