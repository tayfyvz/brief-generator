/**
 * Insert 20 fake departments scattered across the US, for previewing the
 * /briefs list+map with more than one pin. Dev-only scratch script, not
 * part of the app; safe to re-run (upserts by placeId) and to delete rows
 * afterward via scripts/unseed-preview.ts.
 * Usage: node --env-file=.env --import tsx scripts/seed-preview.ts
 */
import { getDb } from "@/lib/db/client";
import { departments, researchRuns, briefs } from "@/lib/db/schema";

const CITIES: Array<{ name: string; city: string; state: string; lat: number; lng: number }> = [
  { name: "Lexington Fire Department", city: "Lexington", state: "IN", lat: 38.9, lng: -85.4 },
  { name: "Portland Fire & Rescue", city: "Portland", state: "OR", lat: 45.5152, lng: -122.6784 },
  { name: "Austin Fire Department", city: "Austin", state: "TX", lat: 30.2672, lng: -97.7431 },
  { name: "Missoula Rural Fire District", city: "Missoula", state: "MT", lat: 46.8721, lng: -113.9940 },
  { name: "Burlington Fire Department", city: "Burlington", state: "VT", lat: 44.4759, lng: -73.2121 },
  { name: "Tampa Fire Rescue", city: "Tampa", state: "FL", lat: 27.9506, lng: -82.4572 },
  { name: "Flagstaff Fire Department", city: "Flagstaff", state: "AZ", lat: 35.1983, lng: -111.6513 },
  { name: "Sioux Falls Fire Rescue", city: "Sioux Falls", state: "SD", lat: 43.5446, lng: -96.7311 },
  { name: "Asheville Fire Department", city: "Asheville", state: "NC", lat: 35.5951, lng: -82.5515 },
  { name: "Spokane Valley Fire Dept", city: "Spokane Valley", state: "WA", lat: 47.6732, lng: -117.2394 },
  { name: "Topeka Fire Department", city: "Topeka", state: "KS", lat: 39.0473, lng: -95.6752 },
  { name: "Providence Fire Department", city: "Providence", state: "RI", lat: 41.8240, lng: -71.4128 },
  { name: "Boise Fire Department", city: "Boise", state: "ID", lat: 43.6150, lng: -116.2023 },
  { name: "Madison Fire Department", city: "Madison", state: "WI", lat: 43.0731, lng: -89.4012 },
  { name: "Baton Rouge Fire Dept", city: "Baton Rouge", state: "LA", lat: 30.4515, lng: -91.1871 },
  { name: "Reno Fire Department", city: "Reno", state: "NV", lat: 39.5296, lng: -119.8138 },
  { name: "Cheyenne Fire & Rescue", city: "Cheyenne", state: "WY", lat: 41.1400, lng: -104.8202 },
  { name: "Bangor Fire Department", city: "Bangor", state: "ME", lat: 44.8016, lng: -68.7712 },
  { name: "Tucson Fire Department", city: "Tucson", state: "AZ", lat: 32.2226, lng: -110.9747 },
  { name: "Anchorage Fire Department", city: "Anchorage", state: "AK", lat: 61.2181, lng: -149.9003 },
];

async function main() {
  const db = getDb();
  for (let i = 0; i < CITIES.length; i++) {
    const c = CITIES[i];
    const placeId = `preview-seed-${i}`;

    await db
      .insert(departments)
      .values({
        placeId,
        name: c.name,
        city: c.city,
        state: c.state,
        lat: c.lat,
        lng: c.lng,
      })
      .onConflictDoUpdate({
        target: departments.placeId,
        set: { name: c.name, city: c.city, state: c.state, lat: c.lat, lng: c.lng },
      });

    const [run] = await db
      .insert(researchRuns)
      .values({ placeId, status: "done", finishedAt: new Date() })
      .returning({ id: researchRuns.id });

    await db
      .insert(briefs)
      .values({
        placeId,
        runId: run.id,
        content: {
          whyCallToday: [],
          curatedFactIds: { leadership: [], fleet: [], money: [], news: [] },
          conflicts: [],
          caveats: [],
          generatedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: briefs.placeId,
        set: { runId: run.id },
      });
  }
  console.log(`Seeded ${CITIES.length} preview departments.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
