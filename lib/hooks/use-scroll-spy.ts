"use client";

import { useEffect, useState } from "react";

/**
 * Tracks which of the given element ids is currently at the top of the
 * viewport, so navs can highlight where the reader is.
 */
export function useScrollSpy(ids: string[], offset = 120): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;

    const onScroll = () => {
      let current = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= offset) current = el.id;
      }
      // At the very bottom, the last section is the one being read.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        current = els[els.length - 1].id;
      }
      setActive(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offset]);

  return active;
}
