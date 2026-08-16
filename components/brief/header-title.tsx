"use client";

import { useEffect } from "react";
import { useSiteHeaderStore } from "@/lib/stores/header-store";

/** Puts the department name into the shared top header while mounted. */
export function HeaderTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
  const setHeader = useSiteHeaderStore((s) => s.setHeader);
  const clearHeader = useSiteHeaderStore((s) => s.clearHeader);

  useEffect(() => {
    setHeader(title, subtitle ?? null);
    return clearHeader;
  }, [title, subtitle, setHeader, clearHeader]);

  return null;
}
