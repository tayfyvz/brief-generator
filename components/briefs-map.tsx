"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { FRESHNESS_META, type Freshness } from "@/lib/format";

export type BriefPin = {
  placeId: string;
  name: string;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  /** Tints the pin by research age; omitted pins use the brand color. */
  freshness?: Freshness;
  /** Human "Researched …" line for the popup, precomputed on the server. */
  researched?: string;
};

// A divIcon with an inline SVG sidesteps Leaflet's bundler-hostile default
// marker PNGs. Teardrop with a white outline and a flame glyph: the outline
// separates the marker from OSM's pale greens/beiges at any fill color.
const FLAME_PATH =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";
const pinHtml = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 40" width="34" height="40"><path d="M17 1.5C9.3 1.5 3 7.8 3 15.5c0 8.6 11.2 20.6 13.2 22.6a1.1 1.1 0 0 0 1.6 0C19.8 36.1 31 24.1 31 15.5 31 7.8 24.7 1.5 17 1.5Z" fill="${fill}" stroke="#fff" stroke-width="2.5"/><g transform="translate(8.6 7) scale(0.7)"><path d="${FLAME_PATH}" fill="#fff"/></g></svg>`;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Brief locations as pins on OSM tiles. Interactive (default) pans/zooms and
 * links each pin's popup to its brief page; non-interactive is a fixed
 * "static" map for showing a single department's location.
 */
export function BriefsMap({
  pins,
  interactive = true,
  zoom = 12,
  className,
}: {
  pins: BriefPin[];
  interactive?: boolean;
  /** Zoom used when there is a single pin; multi-pin maps fit bounds. */
  zoom?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || pins.length === 0) return;
    let disposed = false;
    let map: import("leaflet").Map | undefined;

    // Leaflet touches `window` at import time, so it must load in the browser.
    import("leaflet").then((L) => {
      if (disposed) return;
      map = L.map(
        container,
        interactive
          ? {}
          : {
              dragging: false,
              scrollWheelZoom: false,
              doubleClickZoom: false,
              boxZoom: false,
              keyboard: false,
              touchZoom: false,
              zoomControl: false,
            },
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: "map-tiles",
      }).addTo(map);

      const makeIcon = (fill: string) =>
        L.divIcon({
          className: "brief-pin",
          html: pinHtml(fill),
          iconSize: [34, 40],
          iconAnchor: [17, 38],
          popupAnchor: [0, -34],
        });
      const brandIcon = makeIcon("var(--primary)");

      for (const pin of pins) {
        const locality = [pin.city, pin.state].filter(Boolean).join(", ");
        const marker = L.marker([pin.lat, pin.lng], {
          icon: pin.freshness
            ? makeIcon(FRESHNESS_META[pin.freshness].pinFill)
            : brandIcon,
          title: pin.name,
          interactive,
          keyboard: interactive,
        }).addTo(map);
        if (interactive) {
          marker.bindPopup(
            `<p class="brief-pin-name">${escapeHtml(pin.name)}</p>` +
              (locality
                ? `<p class="brief-pin-locality">${escapeHtml(locality)}</p>`
                : "") +
              (pin.researched
                ? `<p class="brief-pin-locality">Researched ${escapeHtml(pin.researched)}</p>`
                : "") +
              `<a class="brief-pin-link" href="/brief/${encodeURIComponent(pin.placeId)}">Open brief &rarr;</a>`,
          );
        }
      }

      if (pins.length === 1) {
        map.setView([pins[0].lat, pins[0].lng], zoom);
      } else {
        map.fitBounds(
          L.latLngBounds(pins.map((p) => [p.lat, p.lng])),
          { padding: [40, 40], maxZoom: 11 },
        );
      }
    });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [pins, interactive, zoom]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={
        pins.length === 1
          ? `Map showing ${pins[0].name}`
          : "Map of researched departments"
      }
      className={cn(
        "relative isolate z-0 h-[65vh] min-h-[420px] overflow-hidden rounded-xl border bg-muted",
        className,
      )}
    />
  );
}
