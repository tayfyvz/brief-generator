import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LibraryBig,
  MapPin,
} from "lucide-react";
import { BriefsExplorer } from "@/components/briefs-explorer";
import { LibraryFilter } from "@/components/library-filter";
import { getBriefLibrary, getBriefPins } from "@/lib/db/queries";
import { FRESHNESS_META, freshness, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "All briefs · Fire Department Briefs" };

const PAGE_SIZE = 12;

/** Every generated brief, browsable and paginated; nothing lives only behind a URL. */
export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: rawPage, q: rawQ } = await searchParams;
  const requested = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const q = rawQ?.trim() ?? "";

  const [{ rows, total }, pins] = await Promise.all([
    getBriefLibrary(requested, PAGE_SIZE, q).catch(() => ({ rows: [], total: 0 })),
    getBriefPins(q).catch(() => []),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pageCount);

  /** /briefs href preserving the filter and page. */
  const viewHref = (pageNum?: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (pageNum && pageNum > 1) params.set("page", String(pageNum));
    const qs = params.toString();
    return qs ? `/briefs?${qs}` : "/briefs";
  };

  const list =
    rows.length === 0 ? (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">{q ? "No matching briefs" : "No briefs yet"}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {q
            ? `Nothing matches “${q}”. Try a different name, city, or state.`
            : "Paste a Google Place ID on the home page and the researched brief will show up here."}
        </p>
      </div>
    ) : (
      <ul className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
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
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      FRESHNESS_META[freshness(b.createdAt)].dotClass,
                    )}
                  />
                  Researched {relativeDays(b.createdAt)}
                </span>
                <ArrowRight className="size-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </p>
            </Link>
          </li>
        ))}
      </ul>
    );

  const pagination = pageCount > 1 && (
    <nav
      aria-label="Brief pages"
      className="flex items-center justify-center gap-1.5"
    >
      <PageLink href={viewHref(page - 1)} disabled={page <= 1} ariaLabel="Previous page">
        <ChevronLeft className="size-4" />
      </PageLink>
      {pageWindow(page, pageCount).map((n, i) =>
        n === "…" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="flex size-9 items-end justify-center text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Link
            key={n}
            href={viewHref(n)}
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
        ),
      )}
      <PageLink href={viewHref(page + 1)} disabled={page >= pageCount} ariaLabel="Next page">
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );

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
            {q
              ? `${total} department${total === 1 ? "" : "s"} matching “${q}”.`
              : total === 0
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

      <div className="mt-6 flex">
        <LibraryFilter initialQuery={q} />
      </div>

      {pins.length > 0 ? (
        <BriefsExplorer
          pins={pins.map((p) => ({
            ...p,
            freshness: freshness(p.createdAt),
            researched: relativeDays(p.createdAt),
          }))}
          total={total}
          list={list}
          pagination={pagination}
        />
      ) : (
        <div className="@container mt-8">
          {list}
          {pagination && <div className="mt-6">{pagination}</div>}
        </div>
      )}
    </main>
  );
}

/** Page numbers to render: all of them up to 7, else first/last/current±1 with gaps. */
function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const shown = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of shown) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
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
