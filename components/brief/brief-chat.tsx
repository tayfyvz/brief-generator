"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownRight, Send, Siren, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBriefUiStore } from "@/lib/stores/brief-ui-store";
import type { ChatMessage, ChatResponse } from "@/lib/schemas/chat";

/**
 * In-session Q&A over the rendered brief. History lives in component state
 * only: a refresh (or navigating away) starts a fresh conversation, nothing
 * is stored. Answers cite the brief's facts; each citation jumps to its card.
 */

interface DisplayMessage extends ChatMessage {
  citations?: { id: string; claim: string }[];
  /** Failed turns render as errors and are excluded from the transcript sent. */
  error?: boolean;
}

/** Lucide has no fire-helmet glyph, so this one is drawn in its 24×24 stroke style. */
function FireHelmet({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5.5 15a6.5 6.5 0 0 1 13 0" />
      <path d="M2.5 17c2.5-1.3 5.7-2 9.5-2s7 .7 9.5 2" />
      <path d="M10.5 13v-3.5a1.5 1.5 0 0 1 3 0V13" />
    </svg>
  );
}

const SUGGESTIONS = [
  "Who should I call?",
  "What do they drive?",
  "Any money in motion?",
];

export function BriefChat({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false);
  /** True while the pop-out animation plays; the panel unmounts when it ends. */
  const [closing, setClosing] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const revealFact = useBriefUiStore((s) => s.revealFact);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const content = text.trim().slice(0, 2000);
    if (!content || pending) return;
    const next: DisplayMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch(`/api/brief/${placeId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next
            .filter((m) => !m.error)
            .slice(-30)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ChatResponse & { error?: string })
        | null;
      if (res.ok && data?.answer) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.answer, citations: data.citations },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data?.error ?? "Couldn't get an answer right now. Try again.",
            error: true,
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Couldn't reach the server. Check your connection and try again.",
          error: true,
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function close() {
    // A reduced-motion pop-out animation never fires animationend, so close
    // instantly there instead of waiting on an event that won't come.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpen(false);
    } else {
      setClosing(true);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="chip-hover fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg"
        aria-label="Ask about this brief"
      >
        <FireHelmet className="size-4" /> Ask about this brief
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-40 flex h-[min(28rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl",
        closing ? "chat-pop-out" : "chat-pop-in",
      )}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) {
          setOpen(false);
          setClosing(false);
        }
      }}
      role="dialog"
      aria-label="Brief chat"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <FireHelmet className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Ask about this brief</p>
          <p className="text-xs text-muted-foreground">
            Answers come only from this brief. Resets on refresh.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Close chat"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Ask about anything on this page — leadership, apparatus, money, news.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="chip-hover rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : m.error
                  ? "border border-amber-500/40 bg-amber-500/5"
                  : "bg-accent",
            )}
          >
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-foreground/10 pt-2">
                {m.citations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => revealFact(c.id)}
                    className="group flex w-full items-start gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                    title="Jump to this fact"
                  >
                    <CornerDownRight className="mt-0.5 size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate group-hover:underline">
                      {c.claim}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="flex max-w-[85%] items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm text-muted-foreground">
            <div className="siren-beacon shrink-0">
              <Siren className="siren-pulse size-4 text-primary" />
            </div>
            Checking the brief…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t p-2.5"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Ask about this brief…"
          aria-label="Ask about this brief"
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring/40"
        />
        <button
          type="submit"
          disabled={pending || input.trim().length === 0}
          className="chip-hover inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
