export const config = {
  port: Number(process.env.GATEWAY_PORT ?? 8787),
  redisUrl: process.env.REDIS_URL ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  guardrailsUrl:
    process.env.GUARDRAILS_URL ??
    `http://localhost:${process.env.GUARDRAILS_PORT ?? 8000}`,
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqBase: process.env.GATEWAY_UPSTREAM ?? "https://api.groq.com",
  rateLimit: Number(process.env.GATEWAY_RATE_LIMIT ?? 60),
  rateWindowMs: Number(process.env.GATEWAY_RATE_WINDOW_MS ?? 60_000),
  cacheSimThreshold: Number(process.env.CACHE_SIM_THRESHOLD ?? 0.92),
  cacheMaxEntries: Number(process.env.GATEWAY_CACHE_MAX ?? 1000),
  guardTimeoutMs: Number(process.env.GUARD_TIMEOUT_MS ?? 8000),
} as const
