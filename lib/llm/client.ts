import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { getStubStructuredOutput } from "./stub";

/**
 * Thin LLM boundary (PLAN §1): LangGraph orchestrates, nodes call this
 * directly; no LangChain model/prompt wrappers. One method: structured
 * output validated against a Zod schema. Falls back to a deterministic
 * stub when ANTHROPIC_API_KEY is missing.
 */
export interface StructuredRequest<T> {
  /** Stable task name; labels the call and routes the stub ("resolveEntity"…). */
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
    // Thinking is on by default on claude-opus-5 and max_tokens caps thinking
    // plus response text, so leave generous headroom.
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: req.maxTokens ?? 16000,
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

/**
 * OpenAI-backed client (user-directed alternative when no funded Anthropic
 * key is available). Uses chat completions with a JSON-schema response
 * format derived from the same Zod schema, then validates with Zod; the
 * Zod parse is the real gate; one retry on invalid output.
 */
class OpenAiLlmClient implements LlmClient {
  readonly stubbed = false;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: req.maxTokens ?? 8192,
        messages: [
          {
            role: "system",
            content: `${req.system}\nRespond with a single JSON object matching the required schema; no prose.`,
          },
          { role: "user", content: req.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: req.task,
            schema: z.toJSONSchema(req.schema) as Record<string, unknown>,
            strict: false,
          },
        },
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        lastError = new Error(`empty response (finish: ${response.choices[0]?.finish_reason})`);
        continue;
      }
      try {
        return req.schema.parse(JSON.parse(content));
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`LLM output invalid for task "${req.task}": ${lastError}`);
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
  const env = getEnv();
  client = env.ANTHROPIC_API_KEY
    ? new AnthropicLlmClient(env.ANTHROPIC_API_KEY)
    : env.OPENAI_API_KEY
      ? new OpenAiLlmClient(env.OPENAI_API_KEY, env.OPENAI_MODEL)
      : new StubLlmClient();
  return client;
}
