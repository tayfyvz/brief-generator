# Submission notes

## Results on the three Place IDs

| Place ID | Department | Outcome |
|---|---|---|
| `ChIJpcN7ecgAyIkRrOcWzZx3Yyc` | Wise Avenue Volunteer Fire Co; Dundalk, MD | 91 cited facts / 20 sources. Top signals: 2024 government grants up 44.6% to $151,380; frontline Engine 271 is a 1996 Spartan/Quality pumper; prime replacement candidate; full fleet roster with years and models. |
| `ChIJvfrKDp_Ua4gR5CHnUz3MbvE` | Lexington Fire Department; Lexington (Scott County), IN | 6 cited facts / 32 sources searched. A tiny rural volunteer department with almost no web presence; the brief says so honestly instead of padding: township fire fund grew $34k → $40k; no open bids or fleet news on record. |
| `ChIJr-yREGP9tEwRr7M-F00PpM8` | Washington Fire Department; Washington, VT | 32 cited facts / 30 sources. Top signals: active bid sale of a surplus 1991 International 4800 tanker; 1995 International/American refurb scheduled for 2025; state-funded firehouse paving underway. Chief and officer roster current. |

## What's useful to an AE, and what's noise

Useful is anything that changes *this* call: who signs (chief vs. board vs. township trustee), what's aging in the bay (a 1996 frontline pumper is an opening line), and money in motion with amounts and dates (a 44.6% grant jump, an open surplus-tanker bid). The "why call today" strip is deliberately capped at three dated, quantified signals.

Noise: department history, mission statements, incident write-ups, generic "community engagement." We keep such findings (collapsed under "Also found" / "Show all") but never let them crowd the 10-second read. The synthesis prompt explicitly bans undated, generic signals; an honest sparse brief (see Lexington) beats a padded one.

## Where this is most likely confidently wrong, and how we catch it

1. **Wrong department.** "Lexington FD" surfaced Lexington KY's metro department for a 12-person Indiana volunteer company. Defenses: the Places anchor is injected into every prompt with a standing discard rule, every search query must carry city+state, wrong-locale pages extract zero facts, and a fresh-context verifier rejects facts that don't match the anchor (it dropped 30/33 facts before the query fix; the guard held even when retrieval failed).
2. **Stale truth.** Chiefs change; a 2022 article isn't today's roster. Facts older than ~18 months carry a visible "may be stale" badge, and every fact shows its as-of date.
3. **Model paraphrase dressed as citation.** Quotes are validated verbatim against our page snapshot; a fact whose quote isn't a contiguous span of the source is dropped, never shown. The citation popover shows the exact quote so the AE can answer "where'd you hear that."
4. **Conflicting sources** are surfaced side-by-side with a tier+recency resolution note; never silently picked.

## At real scale (1M departments, <100 AEs, weekly re-runs)

The graph and schema stay; the runtime changes. Replace the in-process `RunManager` with a queue + worker pool (the run is already a checkpointed graph keyed by `run_id`, so workers are interchangeable and crashes resume). Weekly refreshes become batched, diff-based jobs: re-fetch only sources whose content hash changed, re-verify only affected facts, and use batch/off-peak LLM pricing; per-department data is kilobytes, so storage is trivial; the cost driver is fetches + tokens, which caps and change-detection control. Add a source-domain cache (council-minutes portals and manufacturer delivery pages are shared across thousands of departments; fetch once, index by department), prioritize refreshes by AE activity and signal volatility (budget season, open bids) instead of a flat weekly sweep, and shard the fact search to pgvector/OpenSearch only if FTS stops being enough. The UI's cached path already reads purely from Postgres, so read scale is a non-issue.

## Cold start: an AE opens an unresearched department and needs it in 30 seconds

Today: the page renders the Places anchor instantly (name, address, click-to-call phone), auto-starts a run, and streams verified facts into sections as they land; the AE watches leadership and fleet fill in while dialing; a full run takes ~4-5 minutes mostly due to polite fetch pacing. To hit "complete in 30 seconds" at scale: pre-warm from the registry (1M departments × weekly batch means a cold open is rare), and reorder the graph for progressive delivery; the anchor + official-site + entity pass lands inside ~15 seconds and answers "who do I ask for," while deeper procurement/funding research streams in behind it. The honest version of this feature is a brief that's explicit about what's verified so far rather than one that pretends to be done.
