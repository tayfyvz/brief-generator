import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { getStubStructuredOutput } from "./stub";

/**
 * Thin LLM boundary (PLAN §1): LangGraph orchestrates, nodes call this
 * directly — no LangChain model/prompt wrappers. One method: structured
 * output validated against a Zod schema. Falls back to a deterministic
 * stub when ANTHROPIC_API_KEY is missing.
 */
export interface StructuredRequest<T> {
  /** Stable task name — labels the call and routes the stub ("resolveEntity"…). */
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /**
   * Structured payload the caller has already rendered into `prompt` for the
   * real model; the stub consumes it directly instead of parsing prose.
   */
  context?: unknown;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface LlmClient {
  structured<T>(req: StructuredRequest<T>): Promise<T>;
  readonly stubbed: boolean;
}

const MODEL = "claude-opus-5";

class AnthropicLlmClient implements LlmClient {
  readonly stubbed = false;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: req.maxTokens ?? 8192,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      output_config: {
        format: zodOutputFormat(req.schema),
        ...(req.effort ? { effort: req.effort } : {}),
      },
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`LLM refused task "${req.task}"`);
    }
    if (response.parsed_output == null) {
      throw new Error(`LLM returned unparseable output for task "${req.task}"`);
    }
    return response.parsed_output;
  }
}

class StubLlmClient implements LlmClient {
  readonly stubbed = true;

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const raw = getStubStructuredOutput(req.task, req.context);
    return req.schema.parse(raw);
  }
}

let client: LlmClient | undefined;

export function getLlmClient(): LlmClient {
  if (client) return client;
  const key = getEnv().ANTHROPIC_API_KEY;
  client = key ? new AnthropicLlmClient(key) : new StubLlmClient();
  return client;
}
