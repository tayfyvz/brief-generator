"use client";

import { create } from "zustand";

/**
 * Tiny UI store for the brief page: lets the fact search jump to a fact card.
 * The section owning the fact expands itself if the fact is hidden behind
 * "Show all", then the card scrolls into view and flashes.
 */
export interface BriefUiState {
  /** Fact id the user asked to see; nonce distinguishes repeat clicks. */
  revealFactId: string | null;
  revealNonce: number;
  revealFact(id: string): void;
}

export const useBriefUiStore = create<BriefUiState>((set) => ({
  revealFactId: null,
  revealNonce: 0,
  revealFact: (id) =>
    set((s) => ({ revealFactId: id, revealNonce: s.revealNonce + 1 })),
}));

/** Scroll a revealed fact card into view and flash it. */
export function scrollToFact(id: string): void {
  const el = document.getElementById(`fact-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("fact-flash");
  window.setTimeout(() => el.classList.remove("fact-flash"), 2000);
}
