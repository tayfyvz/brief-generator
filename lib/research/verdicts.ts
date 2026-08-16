import type { VerifyVerdicts } from "@/lib/schemas/llm";
import type { StoredFact } from "@/lib/graph/state";
import type { BriefConflict } from "@/lib/schemas/brief";

/**
 * Pure application of the verifier's judgment to the fact list (unit tested;
 * the verify node just persists the result). Precedence per fact:
 * rejected > duplicate > conflicted > verified.
 *
 * Duplicates are restatements: the kept fact renders, the dropped ones are
 * hidden (never deleted; provenance stays queryable). Conflicts are genuine
 * contradictions and are surfaced in the brief. The verifier only speaks
 * about fact ids it was shown; unknown ids are ignored.
 */
export interface AppliedVerdicts {
  rejectedIds: string[];
  duplicateIds: string[];
  conflictedIds: string[];
  verifiedIds: string[];
  /** Facts the brief may use: everything not rejected and not a duplicate. */
  surviving: StoredFact[];
  /** Conflict groups that still reference at least two surviving facts. */
  conflicts: BriefConflict[];
}

export function applyVerifyVerdicts(
  factList: StoredFact[],
  verdicts: VerifyVerdicts,
): AppliedVerdicts {
  const knownIds = new Set(factList.map((f) => f.id));
  const verdictById = new Map(
    verdicts.verdicts
      .filter((v) => knownIds.has(v.factId))
      .map((v) => [v.factId, v.verdict]),
  );

  const rejected = new Set(
    factList.filter((f) => verdictById.get(f.id) === "unsupported").map((f) => f.id),
  );

  // A duplicate drop only holds if the kept fact exists and itself survives.
  const duplicates = new Set<string>();
  for (const group of verdicts.duplicates) {
    if (!knownIds.has(group.keepFactId) || rejected.has(group.keepFactId)) continue;
    for (const id of group.dropFactIds) {
      if (knownIds.has(id) && id !== group.keepFactId && !rejected.has(id)) {
        duplicates.add(id);
      }
    }
  }

  const conflicts: BriefConflict[] = verdicts.conflicts
    .map((c) => ({
      ...c,
      factIds: c.factIds.filter(
        (id) => knownIds.has(id) && !rejected.has(id) && !duplicates.has(id),
      ),
    }))
    .filter((c) => c.factIds.length >= 2);
  const conflicted = new Set(conflicts.flatMap((c) => c.factIds));

  const surviving = factList.filter(
    (f) => !rejected.has(f.id) && !duplicates.has(f.id),
  );
  const verifiedIds = surviving
    .filter((f) => !conflicted.has(f.id))
    .map((f) => f.id);

  return {
    rejectedIds: [...rejected],
    duplicateIds: [...duplicates],
    conflictedIds: [...conflicted],
    verifiedIds,
    surviving,
    conflicts,
  };
}
