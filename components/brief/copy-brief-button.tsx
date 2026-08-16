"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies the whole brief as markdown; flashes "Copied" for confirmation. */
export function CopyBriefButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      }}
      className="chip-hover inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium"
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="size-3.5 text-primary" />
      )}
      {copied ? "Copied" : "Copy brief"}
    </button>
  );
}
