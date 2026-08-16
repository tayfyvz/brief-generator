import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  Globe,
  Newspaper,
  Phone,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FactCard, type FactRow, type SourceRow } from "@/components/brief/fact-card";
import { getBriefPageData } from "@/lib/db/queries";
import { placeIdSchema } from "@/lib/schemas/anchor";
import { briefContentSchema, type BriefContent } from "@/lib/schemas/brief";
import { formatDate, relativeDays } from "@/lib/format";

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
  const data = await getBriefPageData(parsed.data);

  if (!data) {
    return (
      <EmptyState
        title="No brief yet"
        note={`We haven't researched ${parsed.data} yet. Live research arrives in a later build step.`}
      />
    );
  }

  const { department, brief, facts, sources } = data;
  const sourceById = new Map<string, SourceRow>(sources.map((s) => [s.id, s]));
  const factById = new Map<string, FactRow>(facts.map((f) => [f.id, f]));
  const content: BriefContent | null = brief
    ? briefContentSchema.parse(brief.content)
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All briefs
      </Link>

      {/* Header */}
      <header className="border-b pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {department.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {department.address && <span>{department.address}</span>}
          {department.phone && (
            <a
              href={`tel:${department.phone}`}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
            >
              <Phone className="size-3.5" /> {department.phone}
            </a>
          )}
          {department.website && (
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
        </div>
        {brief && (
          <p className="mt-3 text-xs text-muted-foreground">
            Researched {relativeDays(brief.createdAt)}
          </p>
        )}
      </header>

      {!content ? (
        <p className="mt-8 text-muted-foreground">
          Department is known but has no brief yet.
        </p>
      ) : (
        <>
          {content.summary && (
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {content.summary}
            </p>
          )}

          {/* Why call today */}
          {content.whyCallToday.length > 0 && (
            <section className="mt-8">
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
            const all = [...curated, ...rest];
            if (all.length === 0) return null;
            const Icon = section.icon;
            return (
              <section key={section.key} className="mt-8">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-4" /> {section.title}
                  <Badge variant="secondary">{all.length}</Badge>
                </h2>
                <div className="grid gap-3">
                  {all.map((fact) => (
                    <FactCard
                      key={fact.id}
                      fact={fact}
                      source={sourceById.get(fact.sourceId)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Also found */}
          {facts.some((f) => f.category === "other") && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Also found
              </h2>
              <div className="grid gap-3">
                {facts
                  .filter((f) => f.category === "other")
                  .map((fact) => (
                    <FactCard
                      key={fact.id}
                      fact={fact}
                      source={sourceById.get(fact.sourceId)}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* Caveats */}
          {content.caveats.length > 0 && (
            <section className="mt-8 rounded-lg border border-dashed p-4">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                Caveats
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {content.caveats.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          )}
        </>
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
