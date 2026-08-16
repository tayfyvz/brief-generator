# Answers

## What's actually useful to an AE on this brief, and what would you cut as noise?

Useful is anything that changes what the AE says on the call. Who to ask for and how to reach them. What apparatus they run and how old it is. Whether money is moving, so budgets, open bids, grants. And a dated reason to call this week instead of next month. That last one is the "why call today" strip at the top of the brief.

I also keep the gaps and conflicts visible. If we couldn't confirm something, the AE should know that before they say it out loud on the phone.

Everything else is noise. Department history, trivia, repeated facts, stale or shaky findings. So the brief ranks facts by how useful they are to the sale, shows at most five per section, and tucks the sources behind a citation chip for anyone who wants to check. If a department is sparse, the brief is short and says so. No padding.

## Where do you think this is most likely to be confidently wrong, and how would you catch that?

The scariest failures are the ones that sound right. I see three.

First, researching the wrong department. Tons of departments share the same name across states, so every fact can be true, just about the wrong place. I made the catch structural instead of asking the model to be careful. The Google Places anchor goes into every prompt with a rule to throw away anything that doesn't match it. A relevance gate filters search results before we spend budget fetching them. And a verifier with fresh context rechecks every fact against the anchor, so it can't inherit the researcher's assumptions.

Second, fake citations. Every quote must exist word for word in our own snapshot of the page. If it doesn't match, it gets one repair attempt and then the fact is dropped. It never reaches the brief.

Third, trusting the wrong source. Government and official sites sit at the top tier. Everything else is usable but marked as worth a double check, and directory sites that imitate official domains are explicitly demoted. When sources disagree we don't quietly pick a winner. Both versions show side by side with their tier and dates, and anything older than about eighteen months gets a stale badge.

What's left after all that is a source that is simply wrong itself. That's why every claim opens to its exact quote in one click. The AE is the final check.

## We have around a million fire departments in the US and fewer than a hundred AEs. Scrapers behind something like this would rerun weekly, and the raw data per department is small, kilobytes to a couple MB. If you were building this for real at that size, what would you do differently?

At that ratio, almost every brief gets generated for nobody. So the write path should be cheap and the read path instant.

The fact model stays exactly as it is. A claim with a verbatim quote, a source tier and an "as of" date is what makes everything downstream cheap. What changes is the runtime around it.

The in process run manager becomes a queue with a worker pool. That's a small step, because runs are already checkpointed graphs keyed by id, so any worker can pick one up and a crash resumes mid graph instead of starting over.

The big move is that weekly reruns should rerun almost nothing. Hash every page snapshot. If the content hasn't changed, there's no extraction, no verification, no tokens spent. Steady state weekly cost for most departments is a handful of HTTP requests.

Facts become append only, each with a valid from and valid to date. That way a new chief is a diff you can alert an AE about, not an overwritten row.

I'd also add a shared source cache. A state grant portal or a manufacturer delivery page covers thousands of departments. Fetch it once, fan it out. Extraction and verification then run only on changed content, on batch pricing, since none of it is latency sensitive. And instead of a flat weekly sweep, refresh priority follows the signal: AE activity, budget season, open bids.

Storage is not the problem here. A couple MB times a million departments is a few terabytes even with snapshots. One Postgres holds it.

## An AE opens a department nobody's ever looked at and needs the brief in thirty seconds. What happens?

Two answers, honestly.

At real scale the question mostly goes away. The weekly batch means every department in the registry already has a brief before anyone opens it.

For the true cold start, the page is built to fill in as it goes. In the first few seconds the AE gets the Places anchor, so name, address, and a phone number they can tap to call, and a run starts on its own. Around fifteen seconds in, entity resolution and the official site land. That answers "who do I ask for," which is really all the first thirty seconds of a call needs. From there, verified facts stream into their sections over SSE behind a visible "still researching" state. The event log is persisted, so a dropped connection replays without losing anything. The full run takes a few minutes, mostly out of politeness in fetch pacing, and by the second call that department is warm forever.

The one thing I won't flex for speed is verification. The partial brief says exactly what's been confirmed so far, and if nothing survives checking, it says that too. A wrong fact delivered in twenty seconds is worse than a spinner, because the AE will say it out loud on the phone.
