export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { purgeExpiredWebhooks } = await import("./lib/db");

  // Enforcement itself — reads defensively re-check expiry too, but purge must not depend on a URL being hit again.
  // ponytail: hourly resolution, not exact-to-the-second — fine for a 7-day TTL; shrink the interval if a tighter bound is ever needed.
  setInterval(() => {
    try {
      purgeExpiredWebhooks();
    } catch (err) {
      console.error("idle webhook sweep failed:", err);
    }
  }, 60 * 60 * 1000);
}
