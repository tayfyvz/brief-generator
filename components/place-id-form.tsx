"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { placeIdSchema } from "@/lib/schemas/anchor";

export function PlaceIdForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = placeIdSchema.safeParse(value);
    if (!parsed.success) {
      setError("That doesn't look like a Google Place ID.");
      return;
    }
    setError(null);
    router.push(`/brief/${parsed.data}`);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a Google Place ID, e.g. ChIJpcN7ecgAyIkRrOcWzZx3Yyc"
          className="h-11 flex-1 rounded-md border bg-background px-4 font-mono text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
          aria-label="Google Place ID"
        />
        <Button type="submit" size="lg" className="h-11">
          <Search className="size-4" />
          Get brief
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </form>
  );
}
