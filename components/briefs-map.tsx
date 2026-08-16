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
// marker PNGs and follows the app theme via CSS variables.
const pinHtml = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" fill="${fill}" stroke="var(--primary-foreground)" stroke-width="1"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="var(--primary-foreground)" stroke="none"/></svg>`;

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
  className,
}: {
  pins: BriefPin[];
  interactive?: boolean;
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
          iconSize: [30, 30],
          iconAnchor: [15, 29],
          popupAnchor: [0, -26],
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
        map.setView([pins[0].lat, pins[0].lng], 12);
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
  }, [pins, interactive]);

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
