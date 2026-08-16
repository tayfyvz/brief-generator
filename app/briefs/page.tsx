import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LibraryBig,
  MapPin,
} from "lucide-react";
import { getBriefLibrary } from "@/lib/db/queries";
import { relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "All briefs · Fire Department Briefs" };

const PAGE_SIZE = 12;

/** Every generated brief, browsable and paginated; nothing lives only behind a URL. */
export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const requested = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  const { rows, total } = await getBriefLibrary(requested, PAGE_SIZE).catch(
    () => ({ rows: [], total: 0 }),
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pageCount);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <span className="icon-tile size-9 rounded-xl">
              <LibraryBig className="size-5" />
            </span>
            All briefs
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {total === 0
              ? "Briefs you generate will be collected here."
              : `${total} researched department${total === 1 ? "" : "s"}, newest first.`}
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          Research a new department
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No briefs yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Paste a Google Place ID on the home page and the researched brief
            will show up here.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((b, i) => (
            <li
              key={b.placeId}
              className="fade-up"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <Link
                href={`/brief/${b.placeId}`}
                className="card-link group flex h-full flex-col p-4"
              >
                <p className="font-medium leading-snug">{b.name}</p>
                {(b.city || b.state) && (
                  <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {[b.city, b.state].filter(Boolean).join(", ")}
                  </p>
                )}
                <p className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
                  Researched {relativeDays(b.createdAt)}
                  <ArrowRight className="size-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Brief pages"
          className="mt-8 flex items-center justify-center gap-1.5"
        >
          <PageLink
            href={`/briefs?page=${page - 1}`}
            disabled={page <= 1}
            ariaLabel="Previous page"
          >
            <ChevronLeft className="size-4" />
          </PageLink>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/briefs?page=${n}`}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg text-sm font-medium tabular-nums transition",
                n === page
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {n}
            </Link>
          ))}
          <PageLink
            href={`/briefs?page=${page + 1}`}
            disabled={page >= pageCount}
            ariaLabel="Next page"
          >
            <ChevronRight className="size-4" />
          </PageLink>
        </nav>
      )}
    </main>
  );
}

function PageLink({
  href,
  disabled,
  ariaLabel,
  children,
}: {
  href: string;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-lg border bg-card text-muted-foreground opacity-40"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="flex size-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {children}
    </Link>
  );
}
