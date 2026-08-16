import Link from "next/link";
import {
  ArrowRight,
  ClipboardPaste,
  FileText,
  Flame,
  MapPin,
  Radar,
} from "lucide-react";
import { PlaceIdForm } from "@/components/place-id-form";
import { ActiveRuns } from "@/components/run/active-runs";
import { getRecentBriefs } from "@/lib/db/queries";
import { relativeDays } from "@/lib/format";

export const dynamic = "force-dynamic";

const SAMPLES: { placeId: string; name: string; location: string }[] = [
  {
    placeId: "ChIJpcN7ecgAyIkRrOcWzZx3Yyc",
    name: "Wise Avenue VFC",
    location: "Dundalk, MD",
  },
  {
    placeId: "ChIJvfrKDp_Ua4gR5CHnUz3MbvE",
    name: "Lexington FD",
    location: "Lexington, IN",
  },
  {
    placeId: "ChIJr-yREGP9tEwRr7M-F00PpM8",
    name: "Washington FD",
    location: "Washington, VT",
  },
];

const STEPS: { icon: typeof Flame; title: string; note: string }[] = [
  {
    icon: ClipboardPaste,
    title: "Paste a Place ID",
    note: "Any fire department from Google Maps; the sample chips work too.",
  },
  {
    icon: Radar,
    title: "Watch the live research",
    note: "Six research tracks search the web in parallel and you see every verified fact land in real time.",
  },
  {
    icon: FileText,
    title: "Get a cited one-page brief",
    note: "Who to call, what they drive, and money moving; every fact links to its exact source quote.",
  },
];

export default async function Home() {
  const recent = await getRecentBriefs(6).catch(() => []);

  return (
    <main className="flex flex-1 flex-col items-center gap-12 px-6 py-14">
      {/* Hero */}
      <div className="fade-up flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl"
          />
          <div className="relative flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Flame className="size-7" />
          </div>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Fire Department Brief Generator
        </h1>
        <p className="max-w-lg text-balance text-muted-foreground">
          Paste a Google Place ID and get a fully cited one-page brief covering
          leadership, fleet, and money moving — researched live while you watch.
        </p>
      </div>

      <PlaceIdForm />

      {/* Samples */}
      <div className="flex flex-col items-center gap-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Or try a sample department
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {SAMPLES.map((s, i) => (
            <Link
              key={s.placeId}
              href={`/brief/${s.placeId}`}
              className="card-link fade-up group inline-flex items-center gap-2 px-3.5 py-2 text-sm"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <MapPin className="size-3.5 text-primary" />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground">{s.location}</span>
              <ArrowRight className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </div>

      <ActiveRuns />

      {/* How it works */}
      <section className="w-full max-w-3xl">
        <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="fade-up rounded-xl border bg-card p-4 shadow-sm"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="icon-tile size-8">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    Step {i + 1}
                  </span>
                </div>
                <p className="mt-2.5 font-medium leading-snug">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {step.note}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Recent briefs */}
      {recent.length > 0 && (
        <section className="w-full max-w-3xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent briefs
            </h2>
            <Link
              href="/briefs"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              View all briefs <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {recent.map((b) => (
              <li key={b.placeId}>
                <Link
                  href={`/brief/${b.placeId}`}
                  className="card-link group flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}</span>
                    {(b.city || b.state) && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {[b.city, b.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {relativeDays(b.createdAt)}
                    <ArrowRight className="size-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
