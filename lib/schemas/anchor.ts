import { z } from "zod/v4";

/**
 * The disambiguation anchor (PLAN §3 N0): what Google Places tells us about
 * the department. Injected into every prompt to reject wrong-department
 * sources (failure mode #1).
 */
export const anchorSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type Anchor = z.infer<typeof anchorSchema>;

/** Google Place IDs are opaque tokens; validate shape loosely but reject junk. */
export const placeIdSchema = z
  .string()
  .trim()
  .min(10)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Not a valid Google Place ID");
