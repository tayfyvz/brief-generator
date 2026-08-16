/**
 * Next.js boot hook: validate env fail-fast, run DB migrations, mark
 * orphaned runs interrupted. Runs once per server start (dev and prod).
 * All node-only work lives in lib/boot-node.ts, which the edge compile
 * aliases away (next.config.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const mod = await import("@/lib/boot-node");
  // The edge bundle aliases this module to false; guard for that shape.
  if (mod && typeof mod.boot === "function") {
    await mod.boot();
  }
}
