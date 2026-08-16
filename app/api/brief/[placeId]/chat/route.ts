import { NextResponse } from "next/server";
import { getBriefPageData } from "@/lib/db/queries";
import { getLlmClient } from "@/lib/llm/client";
import {
  CHAT_SYSTEM,
  renderBriefContext,
  renderChatPrompt,
  resolveCitations,
} from "@/lib/llm/prompts/chat";
import { placeIdSchema } from "@/lib/schemas/anchor";
import { briefContentSchema } from "@/lib/schemas/brief";
import {
  chatAnswerSchema,
  chatRequestSchema,
  type ChatResponse,
} from "@/lib/schemas/chat";

export const dynamic = "force-dynamic";

/** Recent turns sent to the model; older in-session history is dropped. */
const MAX_PROMPT_MESSAGES = 12;

/**
 * Brief Q&A: answers grounded ONLY in this department's stored brief. The
 * context is rebuilt server-side from the same DB rows the page renders —
 * client-sent text is never trusted as a source of facts. Stateless: the
 * client holds the conversation for one page load and sends it whole.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const { placeId: raw } = await params;
  const placeId = placeIdSchema.safeParse(raw);
  if (!placeId.success) {
    return NextResponse.json({ error: "Invalid Place ID." }, { status: 400 });
  }
  const body = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const data = await getBriefPageData(placeId.data);
  if (!data?.brief) {
    return NextResponse.json(
      { error: "No brief exists for this department yet." },
      { status: 404 },
    );
  }

  const llm = getLlmClient();
  if (llm.stubbed) {
    const reply: ChatResponse = {
      answer:
        "Chat is unavailable: no LLM API key is configured. The brief itself is fully browsable.",
      citations: [],
    };
    return NextResponse.json(reply);
  }

  const content = briefContentSchema.parse(data.brief.content);
  const context = renderBriefContext({
    department: data.department,
    summary: content.summary,
    whyCallToday: content.whyCallToday,
    caveats: content.caveats,
    facts: data.facts,
    sources: data.sources,
  });

  try {
    const result = await llm.structured({
      task: "chat",
      system: CHAT_SYSTEM,
      prefix: context,
      prompt: renderChatPrompt(body.data.messages.slice(-MAX_PROMPT_MESSAGES)),
      schema: chatAnswerSchema,
      maxTokens: 4000,
    });
    const reply: ChatResponse = {
      answer: result.answer,
      citations: resolveCitations(result.factIds, data.facts),
    };
    return NextResponse.json(reply);
  } catch (err) {
    console.error("[chat]", err);
    return NextResponse.json(
      { error: "Couldn't get an answer right now. Try again." },
      { status: 502 },
    );
  }
}
