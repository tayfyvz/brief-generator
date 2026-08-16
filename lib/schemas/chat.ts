import { z } from "zod/v4";

/**
 * Brief Q&A chat shapes. History lives in the client for one page load and
 * is sent whole with each request; nothing is persisted server-side.
 */

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(30)
    .refine((m) => m[m.length - 1].role === "user", {
      message: "last message must be from the user",
    }),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * LLM structured output for one chat turn. `factIds` are loose strings, not
 * uuids: the route filters them against the brief's real facts, so a malformed
 * id degrades to a missing citation instead of a failed request.
 */
export const chatAnswerSchema = z.object({
  answer: z.string().min(1),
  factIds: z.array(z.string()),
});
export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

export const chatResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ id: z.string(), claim: z.string() })),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;
