import type { FetchedPage, SearchResult } from "@/lib/schemas/tools";

/**
 * Offline fixtures for stubbed tool clients (no API keys yet). Modeled on the
 * assignment's Weehawken/NHRFR example so the whole pipeline is exercisable
 * end-to-end: stub search returns these URLs, stub fetch returns their pages.
 */

export const FIXTURE_PAGES: Record<string, FetchedPage> = {
  "https://www.nhrfr.org/about": {
    url: "https://www.nhrfr.org/about",
    title: "North Hudson Regional Fire & Rescue — About & Leadership",
    markdown: [
      "# North Hudson Regional Fire & Rescue",
      "",
      "NHRFR serves Weehawken, Union City, West New York, North Bergen and Guttenberg,",
      "a consolidated regional department formed January 11, 1999 under the Consolidated",
      "Municipal Services Act. The region covers over 200,000 permanent residents.",
      "",
      "Weehawken Mayor Richard Turner serves as Chairman of the NHRFR Management Committee.",
      "Executive administration is overseen by Co-Executive Directors Michael DeOrio and Jeff Welz.",
      "Chief of Department: David Donnarumma.",
      "",
      "Administrative HQ (Reports & Records): (201) 601-3542 — 11 Port Imperial Blvd,",
      "West New York, NJ. Offices open Mon–Fri 8:00 AM – 4:00 PM.",
      "Fire Control Center (emergency/non-emergency): (201) 601-3554.",
    ].join("\n"),
  },
  "https://www.fire-safety.com/deliveries/north-hudson-regional": {
    url: "https://www.fire-safety.com/deliveries/north-hudson-regional",
    title: "Fire & Safety Services — NHRFR Pierce Deliveries",
    markdown: [
      "# Recent Pierce deliveries to North Hudson Regional Fire & Rescue",
      "",
      "Delivered November 2018: Pierce Arrow XT 100' tiller (job #31983), Detroit DD13",
      "525hp, TAK-4 suspension — assigned as Ladder 4.",
      "Delivered November 2018: Pierce Enforcer 100' aerial (job #31984), 1,500 GPM pump,",
      "300 gallon tank.",
      "In service since 2015: Pierce Saber custom pumper — 1,500 GPM Waterous pump,",
      "500 gal tank, short wheelbase — assigned as Engine 5 in Weehawken.",
      "",
      "Fire & Safety Services, Ltd. is the exclusive Pierce Manufacturing dealer for New Jersey.",
    ].join("\n"),
    publishedAt: "2018-11-15",
  },
  "https://www.firefighterone.com/deliveries/nhrfr-inferno-102": {
    url: "https://www.firefighterone.com/deliveries/nhrfr-inferno-102",
    title: "Firefighter One — NHRFR 2024 Ferrara Inferno 102' Rearmount",
    markdown: [
      "# NHRFR places 2024 Ferrara Inferno in service",
      "",
      "NHRFR placed the 2024 Ferrara Inferno 102' rear-mount aerial in service as Ladder 5,",
      "replacing a traditional tractor-drawn tiller rig at the 88th Street firehouse in",
      "North Bergen. Older frontline apparatus, such as Ladder Company 1's 2008 Pierce",
      "Arrow XT 100-foot tiller, are scheduled for evaluation and potential replacement",
      "with modern tractor-drawn units in upcoming procurement cycles.",
      "",
      "Firefighter One, LLC represents Ferrara Fire Apparatus and the REV Group in the region.",
    ].join("\n"),
    publishedAt: "2024-06-01",
  },
  "https://www.kim.senate.gov/appropriations/cds-fy2026": {
    url: "https://www.kim.senate.gov/appropriations/cds-fy2026",
    title: "Sen. Andy Kim — FY2026 Congressionally Directed Spending Requests",
    markdown: [
      "# FY2026 Congressionally Directed Spending Requests",
      "",
      "North Hudson Regional Fire and Rescue — Firehouse Modernization and Safety",
      "Upgrades Project — $1,410,000. Sponsored with Rep. Rob Menendez under the",
      "Subcommittee on Commerce, Justice, Science, and Related Agencies. Scope:",
      "reinforcing apparatus bay floors, modernizing HVAC, replacing backup generators.",
    ].join("\n"),
    publishedAt: "2025-05-20",
  },
  "https://hudsoncountyview.com/nhrfr-swears-in-chief-donnarumma": {
    url: "https://hudsoncountyview.com/nhrfr-swears-in-chief-donnarumma",
    title: "Hudson County View — NHRFR swears in Chief David Donnarumma",
    markdown: [
      "# NHRFR swears in new chief",
      "",
      "David Donnarumma, a 30-year veteran of the regional fire service, was sworn in as",
      "Chief of Department in September 2022, taking over leadership following the tenure",
      "of Acting Chief Michael Falco and retired Chief Frank Montagne.",
    ].join("\n"),
    publishedAt: "2022-09-14",
  },
};

export const FIXTURE_SEARCH_RESULTS: SearchResult[] = Object.values(
  FIXTURE_PAGES,
).map((p, i) => ({
  url: p.url,
  title: p.title ?? "",
  snippet: p.markdown.slice(0, 240),
  publishedAt: p.publishedAt,
  score: 0.9 - i * 0.1,
}));
