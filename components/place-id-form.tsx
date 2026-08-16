"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { placeIdSchema } from "@/lib/schemas/anchor";

export function PlaceIdForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = placeIdSchema.safeParse(value.trim());
    if (!parsed.success) {
      setError("That doesn't look like a Google Place ID. It usually starts with “ChIJ”.");
      return;
    }
    setError(null);
    router.push(`/brief/${parsed.data}`);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-xl border bg-card p-1.5 shadow-sm transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/40">
        <MapPin className="ml-2.5 size-4 shrink-0 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste a Google Place ID, e.g. ChIJpcN7ecgAyIkRrOcWzZx3Yyc"
          className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:font-sans"
          aria-label="Google Place ID"
          aria-invalid={Boolean(error)}
        />
        <Button type="submit" className="h-10 shrink-0 gap-1.5 px-4">
          Get brief <ArrowRight className="size-4" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="fade-up mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
