/**
 * Seed the cached-brief path with the Weehawken example department (the
 * assignment's sample research doc) so the brief page renders real-looking
 * data before the live pipeline exists. Idempotent: wipes and re-inserts
 * rows for this place_id only. Run: npm run db:seed
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import {
  briefs,
  departments,
  entities,
  facts,
  researchRuns,
  runEvents,
  sources,
} from "./schema";
import type { BriefContent } from "@/lib/schemas/brief";

const PLACE_ID = "ChIJpcN7ecgAyIkRrOcWzZx3Yyc";

async function seed() {
  const db = getDb();
  const runId = randomUUID();

  // Wipe previous seed for this department (FK order: children first).
  const oldRuns = await db
    .select({ id: researchRuns.id })
    .from(researchRuns)
    .where(eq(researchRuns.placeId, PLACE_ID));
  await db.delete(briefs).where(eq(briefs.placeId, PLACE_ID));
  await db.delete(facts).where(eq(facts.placeId, PLACE_ID));
  for (const run of oldRuns) {
    await db.delete(sources).where(eq(sources.runId, run.id));
    await db.delete(runEvents).where(eq(runEvents.runId, run.id));
  }
  await db.delete(entities).where(eq(entities.placeId, PLACE_ID));
  await db.delete(researchRuns).where(eq(researchRuns.placeId, PLACE_ID));
  await db.delete(departments).where(eq(departments.placeId, PLACE_ID));

  await db.insert(departments).values({
    placeId: PLACE_ID,
    name: "Weehawken Fire Department (NHRFR Engine 5)",
    address: "4610 Park Ave, Weehawken, NJ 07086, USA",
    city: "Weehawken",
    county: "Hudson County",
    state: "New Jersey",
    phone: "(201) 601-3554",
    website: "https://www.nhrfr.org",
    lat: 40.7695,
    lng: -74.0207,
    anchor: {
      placeId: PLACE_ID,
      name: "Weehawken Fire Department (NHRFR Engine 5)",
      address: "4610 Park Ave, Weehawken, NJ 07086, USA",
      city: "Weehawken",
      county: "Hudson County",
      state: "New Jersey",
      phone: "(201) 601-3554",
      website: "https://www.nhrfr.org",
    },
  });

  await db.insert(researchRuns).values({
    id: runId,
    placeId: PLACE_ID,
    status: "done",
    roundCount: 2,
    startedAt: new Date("2026-08-09T14:02:00Z"),
    finishedAt: new Date("2026-08-09T14:07:30Z"),
  });

  const src = {
    official: randomUUID(),
    dealerPierce: randomUUID(),
    dealerFerrara: randomUUID(),
    cds: randomUUID(),
    localPress: randomUUID(),
  };
  await db.insert(sources).values([
    {
      id: src.official,
      runId,
      url: "https://www.nhrfr.org/about",
      title: "North Hudson Regional Fire & Rescue; About & Leadership",
      tier: 1,
      contentMd:
        "# North Hudson Regional Fire & Rescue\n\nNHRFR serves Weehawken, Union City, West New York, North Bergen and Guttenberg…",
      fetchedAt: new Date("2026-08-09T14:03:00Z"),
    },
    {
      id: src.dealerPierce,
      runId,
      url: "https://www.fire-safety.com/deliveries/north-hudson-regional",
      title: "Fire & Safety Services; NHRFR Pierce Deliveries",
      tier: 2,
      contentMd:
        "Delivered November 2018: Pierce Arrow XT 100' tiller (job #31983)…",
      fetchedAt: new Date("2026-08-09T14:04:00Z"),
      publishedAt: "2018-11-15",
    },
    {
      id: src.dealerFerrara,
      runId,
      url: "https://www.firefighterone.com/deliveries/nhrfr-inferno-102",
      title: "Firefighter One; NHRFR 2024 Ferrara Inferno 102' Rearmount",
      tier: 2,
      contentMd:
        "NHRFR placed the 2024 Ferrara Inferno 102' rear-mount aerial in service…",
      fetchedAt: new Date("2026-08-09T14:04:30Z"),
      publishedAt: "2024-06-01",
    },
    {
      id: src.cds,
      runId,
      url: "https://www.kim.senate.gov/appropriations/cds-fy2026",
      title: "Sen. Andy Kim; FY2026 Congressionally Directed Spending Requests",
      tier: 1,
      contentMd:
        "North Hudson Regional Fire and Rescue; Firehouse Modernization and Safety Upgrades Project; $1,410,000…",
      fetchedAt: new Date("2026-08-09T14:05:00Z"),
      publishedAt: "2025-05-20",
    },
    {
      id: src.localPress,
      runId,
      url: "https://hudsoncountyview.com/nhrfr-swears-in-chief-donnarumma",
      title: "Hudson County View; NHRFR swears in Chief David Donnarumma",
      tier: 3,
      contentMd:
        "David Donnarumma, a 30-year veteran, was sworn in as Chief of Department in September 2022…",
      fetchedAt: new Date("2026-08-09T14:05:30Z"),
      publishedAt: "2022-09-14",
    },
  ]);

  const factId = {
    chief: randomUUID(),
    boardChair: randomUUID(),
    execDirectors: randomUUID(),
    adminContact: randomUUID(),
    engine5: randomUUID(),
    ladder5: randomUUID(),
    ladder4: randomUUID(),
    tillerReplacement: randomUUID(),
    dealers: randomUUID(),
    cdsRequest: randomUUID(),
    infernoInService: randomUUID(),
    regionalScope: randomUUID(),
  };

  await db.insert(facts).values([
    {
      id: factId.chief,
      runId,
      placeId: PLACE_ID,
      sourceId: src.localPress,
      category: "leadership",
      tags: ["chief", "appointment"],
      claim:
        "Chief of Department is David Donnarumma, a 30-year veteran sworn into command in September 2022.",
      quote:
        "David Donnarumma, a 30-year veteran, was sworn in as Chief of Department in September 2022",
      asOfDate: "2022-09-14",
      discoveredRound: 0,
      verification: "verified",
      confidence: "high",
      stale: true,
    },
    {
      id: factId.boardChair,
      runId,
      placeId: PLACE_ID,
      sourceId: src.official,
      category: "leadership",
      tags: ["board", "budget-authority"],
      claim:
        "Weehawken Mayor Richard Turner chairs the NHRFR Management Committee, which authorizes capital budgets.",
      quote:
        "Weehawken Mayor Richard Turner serves as Chairman of the NHRFR Management Committee",
      asOfDate: "2026-08-09",
      discoveredRound: 0,
      verification: "verified",
      confidence: "high",
      stale: false,
    },
    {
      id: factId.execDirectors,
      runId,
      placeId: PLACE_ID,
      sourceId: src.official,
      category: "leadership",
      tags: ["administration"],
      claim:
        "Executive administration is run by Co-Executive Directors Michael DeOrio and Jeff Welz.",
      quote:
        "Executive administration is overseen by Co-Executive Directors Michael DeOrio and Jeff Welz",
      asOfDate: "2026-08-09",
      discoveredRound: 0,
      verification: "verified",
      confidence: "medium",
      stale: false,
    },
    {
      id: factId.adminContact,
      runId,
      placeId: PLACE_ID,
      sourceId: src.official,
      category: "leadership",
      tags: ["contact", "phone"],
      claim:
        "Administrative HQ is at 11 Port Imperial Blvd, West New York, NJ; (201) 601-3542, Mon-Fri 8:00-4:00.",
      quote:
        "Administrative HQ (Reports & Records) (201) 601-3542; 11 Port Imperial Blvd, West New York, NJ",
      asOfDate: "2026-08-09",
      discoveredRound: 0,
      verification: "verified",
      confidence: "high",
      stale: false,
    },
    {
      id: factId.engine5,
      runId,
      placeId: PLACE_ID,
      sourceId: src.dealerPierce,
      category: "fleet",
      tags: ["pumper", "pierce", "frontline"],
      claim:
        "Engine 5's frontline rig is a 2015 Pierce Saber custom pumper; 1,500 GPM Waterous pump, 500-gallon tank, short wheelbase for the Palisades grid.",
      quote:
        "2015 Pierce Saber Custom Pumper; 1,500 GPM Waterous pump, 500 gal tank, short wheelbase",
      asOfDate: "2026-08-09",
      discoveredRound: 0,
      verification: "verified",
      confidence: "high",
      stale: false,
      attributes: { year: 2015, make: "Pierce", model: "Saber", pumpGpm: 1500 },
    },
    {
      id: factId.ladder5,
      runId,
      placeId: PLACE_ID,
      sourceId: src.dealerFerrara,
      category: "fleet",
      tags: ["aerial", "ferrara", "delivery"],
      claim:
        "Ladder 5 is a 2024 Ferrara Inferno 102' rear-mount aerial, delivered and in service 2024.",
      quote:
        "NHRFR placed the 2024 Ferrara Inferno 102' rear-mount aerial in service",
      asOfDate: "2024-06-01",
      discoveredRound: 1,
      verification: "verified",
      confidence: "high",
      stale: false,
      attributes: { year: 2024, make: "Ferrara", model: "Inferno 102' RM" },
    },
    {
      id: factId.ladder4,
      runId,
      placeId: PLACE_ID,
      sourceId: src.dealerPierce,
      category: "fleet",
      tags: ["tiller", "pierce"],
      claim:
        "Ladder 4 is a 2018 Pierce Arrow XT 100' tiller (job #31983), delivered November 2018.",
      quote:
        "Delivered November 2018: Pierce Arrow XT 100' tiller (job #31983)",
      asOfDate: "2018-11-15",
      discoveredRound: 1,
      verification: "verified",
      confidence: "high",
      stale: false,
      attributes: { year: 2018, make: "Pierce", model: "Arrow XT 100' tiller" },
    },
    {
      id: factId.tillerReplacement,
      runId,
      placeId: PLACE_ID,
      sourceId: src.dealerFerrara,
      category: "fleet",
      tags: ["replacement-cycle", "tiller", "opportunity"],
      claim:
        "Ladder 1's 2008 Pierce Arrow XT 100' tiller is scheduled for evaluation and potential replacement in upcoming procurement cycles.",
      quote:
        "older frontline apparatus, such as Ladder Company 1's 2008 Pierce Arrow XT 100-foot tiller, are scheduled for evaluation and potential replacement",
      asOfDate: "2026-08-09",
      discoveredRound: 2,
      verification: "verified",
      confidence: "medium",
      stale: false,
      attributes: { year: 2008, make: "Pierce", ageYears: 18 },
    },
    {
      id: factId.dealers,
      runId,
      placeId: PLACE_ID,
      sourceId: src.dealerFerrara,
      category: "procurement",
      tags: ["dealer", "relationships"],
      claim:
        "Apparatus purchases run through Fire & Safety Services (Pierce) and Firefighter One, LLC (Ferrara / REV Group).",
      quote:
        "primary regional apparatus dealers, including Fire & Safety Services, Ltd. (representing Pierce Manufacturing) and Firefighter One, LLC (representing Ferrara Fire Apparatus and the REV Group)",
      asOfDate: "2026-08-09",
      discoveredRound: 1,
      verification: "verified",
      confidence: "high",
      stale: false,
    },
    {
      id: factId.cdsRequest,
      runId,
      placeId: PLACE_ID,
      sourceId: src.cds,
      category: "funding",
      tags: ["federal", "cds", "facilities"],
      claim:
        "NHRFR has a $1,410,000 Congressionally Directed Spending request (Sen. Andy Kim / Rep. Rob Menendez) for the Firehouse Modernization and Safety Upgrades Project.",
      quote:
        "North Hudson Regional Fire and Rescue; Firehouse Modernization and Safety Upgrades Project; $1,410,000",
      asOfDate: "2025-05-20",
      discoveredRound: 1,
      verification: "verified",
      confidence: "high",
      stale: false,
      attributes: { amountUsd: 1410000, status: "requested" },
    },
    {
      id: factId.infernoInService,
      runId,
      placeId: PLACE_ID,
      sourceId: src.dealerFerrara,
      category: "news",
      tags: ["delivery", "modernization"],
      claim:
        "The 2024 Ferrara Inferno replaced a tractor-drawn tiller at the 88th Street firehouse; the fleet is shifting toward rear-mount aerials.",
      quote:
        "2024 Ferrara Inferno 102-foot rear-mount aerial, which replaced a traditional tractor-drawn tiller rig at the 88th Street firehouse",
      asOfDate: "2024-06-01",
      discoveredRound: 2,
      verification: "verified",
      confidence: "medium",
      stale: false,
    },
    {
      id: factId.regionalScope,
      runId,
      placeId: PLACE_ID,
      sourceId: src.official,
      category: "other",
      tags: ["governance", "regional"],
      claim:
        "This station buys through NHRFR; a 1999 consolidation of five municipalities (Weehawken, Union City, North Bergen, West New York, Guttenberg) serving 200,000+ residents.",
      quote:
        "NHRFR serves Weehawken, Union City, West New York, North Bergen and Guttenberg",
      asOfDate: "2026-08-09",
      discoveredRound: 0,
      verification: "verified",
      confidence: "high",
      stale: false,
    },
  ]);

  await db.insert(entities).values([
    {
      placeId: PLACE_ID,
      kind: "parent_org",
      name: "North Hudson Regional Fire and Rescue",
      attributes: {
        relations: [
          { type: "operates", target: "Weehawken Fire Department (NHRFR Engine 5)" },
        ],
        website: "https://www.nhrfr.org",
      },
    },
    {
      placeId: PLACE_ID,
      kind: "dealer",
      name: "Fire & Safety Services, Ltd.",
      attributes: { represents: "Pierce Manufacturing" },
    },
    {
      placeId: PLACE_ID,
      kind: "dealer",
      name: "Firefighter One, LLC",
      attributes: { represents: "Ferrara Fire Apparatus / REV Group" },
    },
  ]);

  const content: BriefContent = {
    summary:
      "This station is part of North Hudson Regional Fire & Rescue; apparatus decisions are made regionally, not by Weehawken alone. The board chair (Weehawken's mayor) signs off on capital budgets, and the fleet is mid-modernization: new Ferrara rear-mounts arriving while a 2008 tiller comes up for replacement.",
    whyCallToday: [
      {
        headline:
          "A 2008 tiller is up for replacement evaluation in upcoming procurement cycles",
        detail:
          "Ladder 1's 18-year-old Pierce Arrow XT tiller is the concrete near-term apparatus opportunity.",
        date: "2026-08-09",
        factIds: [factId.tillerReplacement],
      },
      {
        headline: "$1.41M federal facilities request is in play",
        detail:
          "Congressionally Directed Spending request for firehouse modernization signals active capital appetite.",
        date: "2025-05-20",
        factIds: [factId.cdsRequest],
      },
      {
        headline:
          "Fleet is standardizing: Ferrara rear-mount aerials + Pierce pumpers via two dealers",
        detail:
          "Recent buys ran through Firefighter One (Ferrara) and Fire & Safety Services (Pierce).",
        date: "2024-06-01",
        factIds: [factId.ladder5, factId.dealers],
      },
    ],
    curatedFactIds: {
      leadership: [
        factId.chief,
        factId.boardChair,
        factId.adminContact,
        factId.execDirectors,
      ],
      fleet: [
        factId.tillerReplacement,
        factId.ladder5,
        factId.engine5,
        factId.ladder4,
      ],
      money: [factId.cdsRequest, factId.dealers],
      news: [factId.infernoInService],
    },
    conflicts: [],
    caveats: [
      "Chief appointment reporting is from 2022; verify current command before the call.",
      "Seed data for development: distilled from the assignment's example research document.",
    ],
    generatedAt: "2026-08-09T14:07:30Z",
  };

  await db.insert(briefs).values({
    placeId: PLACE_ID,
    runId,
    content,
  });

  console.log(`Seeded department ${PLACE_ID} (run ${runId})`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
