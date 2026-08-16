"use client";

import { create } from "zustand";

/**
 * Lets a page place its subject (e.g. the fire department name) in the
 * shared top header. The brief page sets it on mount and clears on unmount.
 */
export interface SiteHeaderState {
  title: string | null;
  subtitle: string | null;
  setHeader(title: string, subtitle?: string | null): void;
  clearHeader(): void;
}

export const useSiteHeaderStore = create<SiteHeaderState>((set) => ({
  title: null,
  subtitle: null,
  setHeader: (title, subtitle = null) => set({ title, subtitle }),
  clearHeader: () => set({ title: null, subtitle: null }),
}));
