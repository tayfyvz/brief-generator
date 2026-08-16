import Link from "next/link";
import { Flame, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlaceIdForm } from "@/components/place-id-form";
import { getRecentBriefs } from "@/lib/db/queries";
import { relativeDays } from "@/lib/format";

export const dynamic = "force-dynamic";

const SAMPLES: { placeId: string; label: string }[] = [
  { placeId: "ChIJpcN7ecgAyIkRrOcWzZx3Yyc", label: "Weehawken, NJ" },
  { placeId: "ChIJvfrKDp_Ua4gR5CHnUz3MbvE", label: "Sample 2" },
  { placeId: "ChIJr-yREGP9tEwRr7M-F00PpM8", label: "Sample 3" },
];

export default async function Home() {
  const recent = await getRecentBriefs().catch(() => []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Flame className="size-6" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Fire Department Brief Generator
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Paste a Google Place ID and get a fully-cited one-page brief —
          leadership, fleet, money moving — researched live.
        </p>
      </div>

      <PlaceIdForm />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">Try a sample:</span>
        {SAMPLES.map((s) => (
          <Link key={s.placeId} href={`/brief/${s.placeId}`}>
            <Badge variant="secondary" className="cursor-pointer px-3 py-1">
              <MapPin className="size-3" />
              {s.label}
            </Badge>
          </Link>
        ))}
      </div>

      {recent.length > 0 && (
        <section className="w-full max-w-xl">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Recent briefs
          </h2>
          <ul className="divide-y rounded-lg border">
            {recent.map((b) => (
              <li key={b.placeId}>
                <Link
                  href={`/brief/${b.placeId}`}
                  className="flex items-center justify-between px-4 py-3 transition hover:bg-accent"
                >
                  <span className="font-medium">
                    {b.name}
                    {b.city && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {b.city}
                        {b.state ? `, ${b.state}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {relativeDays(b.createdAt)}
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
