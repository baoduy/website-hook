export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { purgeExpiredWebhooks } = await import("./lib/db");

  // Enforcement itself — reads defensively re-check expiry too, but purge must not depend on a URL being hit again.
  // ponytail: hourly resolution, not exact-to-the-second — fine for a 7-day TTL; shrink the interval if a tighter bound is ever needed.
  setInterval(async () => {
    try {
      await purgeExpiredWebhooks();
    } catch (err) {
      console.error("idle webhook sweep failed:", err);
    }
  }, 60 * 60 * 1000);
}

/** Cloudflare Workers Cron Trigger entry point — replaces the Node.js setInterval on the edge runtime. */
export async function scheduled(): Promise<void> {
  const { purgeExpiredWebhooks } = await import("./lib/db");

  try {
    await purgeExpiredWebhooks();
  } catch (err) {
    console.error("idle webhook sweep failed:", err);
  }
}
