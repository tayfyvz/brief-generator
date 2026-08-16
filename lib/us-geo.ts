/**
 * Approximate bounding boxes for framing maps — precise borders don't
 * matter, only that the whole unit lands in view. Corners are
 * [[south, west], [north, east]].
 */

export type GeoBounds = [[number, number], [number, number]];

export const US_BOUNDS: GeoBounds = [
  [24.4, -125.0],
  [49.5, -66.9],
];

const STATE_BOUNDS: Record<string, GeoBounds> = {
  alabama: [[30.2, -88.5], [35.0, -84.9]],
  alaska: [[51.2, -179.1], [71.4, -129.9]],
  arizona: [[31.3, -114.8], [37.0, -109.0]],
  arkansas: [[33.0, -94.6], [36.5, -89.6]],
  california: [[32.5, -124.4], [42.0, -114.1]],
  colorado: [[37.0, -109.1], [41.0, -102.0]],
  connecticut: [[41.0, -73.7], [42.1, -71.8]],
  delaware: [[38.4, -75.8], [39.8, -75.0]],
  "district of columbia": [[38.8, -77.1], [39.0, -76.9]],
  florida: [[24.5, -87.6], [31.0, -80.0]],
  georgia: [[30.4, -85.6], [35.0, -80.8]],
  hawaii: [[18.9, -160.3], [22.2, -154.8]],
  idaho: [[42.0, -117.2], [49.0, -111.0]],
  illinois: [[37.0, -91.5], [42.5, -87.0]],
  indiana: [[37.8, -88.1], [41.8, -84.8]],
  iowa: [[40.4, -96.6], [43.5, -90.1]],
  kansas: [[37.0, -102.1], [40.0, -94.6]],
  kentucky: [[36.5, -89.6], [39.2, -82.0]],
  louisiana: [[28.9, -94.0], [33.0, -88.8]],
  maine: [[43.1, -71.1], [47.5, -67.0]],
  maryland: [[37.9, -79.5], [39.7, -75.0]],
  massachusetts: [[41.2, -73.5], [42.9, -69.9]],
  michigan: [[41.7, -90.4], [48.3, -82.1]],
  minnesota: [[43.5, -97.2], [49.4, -89.5]],
  mississippi: [[30.2, -91.7], [35.0, -88.1]],
  missouri: [[36.0, -95.8], [40.6, -89.1]],
  montana: [[44.4, -116.1], [49.0, -104.0]],
  nebraska: [[40.0, -104.1], [43.0, -95.3]],
  nevada: [[35.0, -120.0], [42.0, -114.0]],
  "new hampshire": [[42.7, -72.6], [45.3, -70.6]],
  "new jersey": [[38.9, -75.6], [41.4, -73.9]],
  "new mexico": [[31.3, -109.1], [37.0, -103.0]],
  "new york": [[40.5, -79.8], [45.0, -71.9]],
  "north carolina": [[33.8, -84.3], [36.6, -75.5]],
  "north dakota": [[45.9, -104.1], [49.0, -96.6]],
  ohio: [[38.4, -84.8], [42.0, -80.5]],
  oklahoma: [[33.6, -103.0], [37.0, -94.4]],
  oregon: [[42.0, -124.6], [46.3, -116.5]],
  pennsylvania: [[39.7, -80.5], [42.3, -74.7]],
  "rhode island": [[41.1, -71.9], [42.0, -71.1]],
  "south carolina": [[32.0, -83.4], [35.2, -78.5]],
  "south dakota": [[42.5, -104.1], [46.0, -96.4]],
  tennessee: [[35.0, -90.3], [36.7, -81.6]],
  texas: [[25.8, -106.7], [36.5, -93.5]],
  utah: [[37.0, -114.1], [42.0, -109.0]],
  vermont: [[42.7, -73.4], [45.0, -71.5]],
  virginia: [[36.5, -83.7], [39.5, -75.2]],
  washington: [[45.5, -124.9], [49.0, -116.9]],
  "west virginia": [[37.2, -82.6], [40.6, -77.7]],
  wisconsin: [[42.5, -92.9], [47.1, -86.8]],
  wyoming: [[41.0, -111.1], [45.0, -104.1]],
};

/** Bounds for a state as Google's anchor names it ("Indiana"); null if unknown. */
export function stateBounds(state: string | null | undefined): GeoBounds | null {
  if (!state) return null;
  return STATE_BOUNDS[state.trim().toLowerCase()] ?? null;
}
