"use client";

import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunStore } from "@/lib/stores/run-store";

/**
 * Placeholder for the brief body while research is still running: shimmering
 * section skeletons so the reader sees where results will land. The live-run
 * panel above shows facts streaming in; when the run finishes the page
 * refreshes and the real brief replaces this.
 */
export function BriefPending() {
  const status = useRunStore((s) => s.status);

  if (status === "failed") {
    return (
      <div className="mt-10 rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">Research did not finish</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Something went wrong during this run. Use the buttons above to try
          again; previous results are never lost.
        </p>
      </div>
    );
  }

  if (status === "idle") {
    return (
      <div className="mt-10 rounded-xl border border-dashed p-8 text-center">
        <FileText className="mx-auto size-8 text-muted-foreground/50" />
        <p className="mt-3 font-medium">No brief yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Research starts automatically and the finished brief will appear
          right here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8" aria-label="Brief loading" role="status">
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      {[0, 1, 2].map((i) => (
        <section key={i}>
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="size-7 rounded-lg" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </section>
      ))}
      <p className="text-center text-xs text-muted-foreground">
        Sections fill in the moment research finishes; verified facts stream
        into the panel above as they are found.
      </p>
    </div>
  );
}
