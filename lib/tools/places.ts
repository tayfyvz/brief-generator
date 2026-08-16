import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { anchorSchema, type Anchor } from "@/lib/schemas/anchor";

/**
 * Google Places Details client (PLAN §3 N0). Place ID → anchor packet.
 * Returns null when the Place ID does not resolve. Falls back to a stub
 * when GOOGLE_PLACES_API_KEY is missing — never blocks on a missing key.
 */
export interface PlacesClient {
  getDetails(placeId: string): Promise<Anchor | null>;
  readonly stubbed: boolean;
}

/** Places API (New) v1 response — only the fields we request. */
const placeResponseSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  addressComponents: z
    .array(
      z.object({
        longText: z.string(),
        types: z.array(z.string()),
      }),
    )
    .optional(),
  nationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
});

function componentOf(
  components: z.infer<typeof placeResponseSchema>["addressComponents"],
  type: string,
): string | undefined {
  return components?.find((c) => c.types.includes(type))?.longText;
}

class GooglePlacesClient implements PlacesClient {
  readonly stubbed = false;
  constructor(private readonly apiKey: string) {}

  async getDetails(placeId: string): Promise<Anchor | null> {
    const fields = [
      "id",
      "displayName",
      "formattedAddress",
      "addressComponents",
      "nationalPhoneNumber",
      "websiteUri",
      "location",
    ].join(",");
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": fields,
        },
      },
    );
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) {
      throw new Error(`Places API ${res.status}: ${await res.text()}`);
    }
    const place = placeResponseSchema.parse(await res.json());
    return anchorSchema.parse({
      placeId: place.id,
      name: place.displayName?.text ?? "Unknown department",
      address: place.formattedAddress,
      city:
        componentOf(place.addressComponents, "locality") ??
        componentOf(place.addressComponents, "sublocality"),
      county: componentOf(
        place.addressComponents,
        "administrative_area_level_2",
      ),
      state: componentOf(place.addressComponents, "administrative_area_level_1"),
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
    });
  }
}

/** Fixture anchors so the whole pipeline is exercisable without a key. */
const STUB_ANCHORS: Record<string, Anchor> = {
  ChIJpcN7ecgAyIkRrOcWzZx3Yyc: {
    placeId: "ChIJpcN7ecgAyIkRrOcWzZx3Yyc",
    name: "Weehawken Fire Department (NHRFR Station — Engine 5)",
    address: "4610 Park Ave, Weehawken, NJ 07086, USA",
    city: "Weehawken",
    county: "Hudson County",
    state: "New Jersey",
    phone: "(201) 601-3554",
    lat: 40.7695,
    lng: -74.0207,
  },
};

class StubPlacesClient implements PlacesClient {
  readonly stubbed = true;

  async getDetails(placeId: string): Promise<Anchor | null> {
    const known = STUB_ANCHORS[placeId];
    if (known) return known;
    return anchorSchema.parse({
      placeId,
      name: `Stubbed Fire Department (${placeId.slice(0, 8)}…)`,
      address: "123 Main St, Anytown, USA",
      city: "Anytown",
      state: "Anystate",
    });
  }
}

let client: PlacesClient | undefined;

export function getPlacesClient(): PlacesClient {
  if (client) return client;
  const key = getEnv().GOOGLE_PLACES_API_KEY;
  client = key ? new GooglePlacesClient(key) : new StubPlacesClient();
  return client;
}
