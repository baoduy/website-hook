// Shared limits — imported by the service and its tests. Never hardcode these numbers elsewhere.
export const MAX_BODY_BYTES = 1_048_576;
export const TTL_DAYS = 7;
export const MAX_REQUESTS_PER_WEBHOOK = 1000;
export const CREATE_RATE_LIMIT = { windowMs: 60_000, max: 20 };
