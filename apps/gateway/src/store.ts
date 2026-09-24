import { createHash, randomUUID } from "node:crypto"
import { Redis } from "ioredis"
import { config } from "./config.ts"

let _redis: Redis | null | undefined
let _redisDown = false

export function getRedis(): Redis | null {
  if (process.env.BREAKWALL_OFFLINE_TEST === "1") return null
  if (_redis !== undefined) return _redis
  if (!config.redisUrl) {
    _redis = null
    return null
  }
  try {
    const r = new Redis(config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    })
    r.on("error", () => {
      _redisDown = true
    })
    r.on("ready", () => {
      _redisDown = false
    })
    _redis = r
    // lazyConnect requires an explicit connect — kick it off once.
    r.connect().catch(() => {
      _redisDown = true
    })
  } catch {
    _redis = null
  }
  return _redis
}

export function redisAvailable(): boolean {
  return getRedis() !== null && !_redisDown
}

export function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

// ---------- Rate limiter (sliding window) ----------

export interface RateResult {
  allowed: boolean
  remaining: number
}

const memHits = new Map<string, number[]>()

export async function rateCheck(key: string): Promise<RateResult> {
  const redis = getRedis()
  if (redis && !_redisDown) {
    try {
      const now = Date.now()
      const member = `${now}-${randomUUID().slice(0, 8)}`
      const pipe = redis.pipeline()
      pipe.zremrangebyscore(key, 0, now - config.rateWindowMs)
      pipe.zadd(key, now.toString(), member)
      pipe.zcard(key)
      pipe.expire(key, Math.ceil(config.rateWindowMs / 1000) + 1)
      const res = await pipe.exec()
      // exec() can resolve with per-command failures (e.g. not yet connected) —
      // only trust finite counts, otherwise fall through to memory.
      const count = Number(res?.[2]?.[1])
      if (Number.isFinite(count)) {
        return {
          allowed: count <= config.rateLimit,
          remaining: Math.max(0, config.rateLimit - count),
        }
      }
      _redisDown = true
    } catch {
      _redisDown = true
    }
  }
  const now = Date.now()
  const arr = (memHits.get(key) ?? []).filter(
    (t) => t > now - config.rateWindowMs,
  )
  arr.push(now)
  memHits.set(key, arr)
  return {
    allowed: arr.length <= config.rateLimit,
    remaining: Math.max(0, config.rateLimit - arr.length),
  }
}

export function resetRateLimiter(): void {
  memHits.clear()
}

// ---------- Semantic cache ----------

export interface CacheEntry {
  output: string
  redacted: boolean
  costUsd: number
  latencyMs: number
}

export interface CacheHit extends CacheEntry {
  kind: "exact" | "similar"
  similarity: number
}

function normalizeMessages(messages: unknown): string {
  return JSON.stringify(messages)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function shingles(norm: string): Set<string> {
  const toks = norm.split(" ").filter(Boolean)
  const set = new Set<string>()
  for (let i = 0; i < toks.length; i++) {
    set.add(`u:${toks[i]}`)
    if (i < toks.length - 1) set.add(`b:${toks[i]}|${toks[i + 1]}`)
  }
  return set
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  const [small, big] = a.size < b.size ? [a, b] : [b, a]
  for (const x of small) if (big.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

interface IndexRow {
  key: string
  norm: string
  sh: Set<string>
}

const memValues = new Map<string, CacheEntry>()
const memIndex: IndexRow[] = []

function namespacedKey(model: string, messages: unknown): string {
  const ns = sha256hex(model).slice(0, 8)
  return `bw:cache:${ns}:${sha256hex(`${model}\n${normalizeMessages(messages)}`)}`
}

function evictIfNeeded(): void {
  while (memIndex.length > config.cacheMaxEntries) {
    const old = memIndex.shift()
    if (old) memValues.delete(old.key)
  }
}

export async function cacheGet(
  model: string,
  messages: unknown,
): Promise<CacheHit | null> {
  const ns = sha256hex(model).slice(0, 8)
  const prefix = `bw:cache:${ns}:`
  const exact = namespacedKey(model, messages)

  // 1. normalized-exact hit (case/punctuation-insensitive by construction)
  const mem = memValues.get(exact)
  if (mem) return { ...mem, kind: "exact", similarity: 1 }
  const redis = getRedis()
  if (redis && !_redisDown) {
    try {
      const raw = await redis.get(exact)
      if (raw) {
        const entry = JSON.parse(raw) as CacheEntry
        memValues.set(exact, entry) // warm memory path (incl. similarity index)
        const norm = normalizeMessages(messages)
        if (!memIndex.some((r) => r.key === exact))
          memIndex.push({ key: exact, norm, sh: shingles(norm) })
        evictIfNeeded()
        return { ...entry, kind: "exact", similarity: 1 }
      }
    } catch {
      _redisDown = true
    }
  }

  // 2. similarity scan over same-model memory index
  const query = shingles(normalizeMessages(messages))
  let best: IndexRow | null = null
  let bestSim = 0
  for (const row of memIndex) {
    if (!row.key.startsWith(prefix)) continue
    const s = jaccard(query, row.sh)
    if (s > bestSim) {
      bestSim = s
      best = row
    }
  }
  if (best && bestSim >= config.cacheSimThreshold) {
    const v = memValues.get(best.key)
    if (v) return { ...v, kind: "similar", similarity: bestSim }
  }
  return null
}

export async function cacheSet(
  model: string,
  messages: unknown,
  entry: CacheEntry,
): Promise<void> {
  const exact = namespacedKey(model, messages)

  memValues.set(exact, entry)
  const existing = memIndex.findIndex((r) => r.key === exact)
  const row: IndexRow = {
    key: exact,
    norm: normalizeMessages(messages),
    sh: shingles(normalizeMessages(messages)),
  }
  if (existing >= 0) memIndex[existing] = row
  else memIndex.push(row)
  evictIfNeeded()

  const redis = getRedis()
  if (redis && !_redisDown) {
    try {
      await redis.set(exact, JSON.stringify(entry), "EX", 3600)
    } catch {
      _redisDown = true
    }
  }
}

export function resetCache(): void {
  memValues.clear()
  memIndex.length = 0
}

export { normalizeMessages, jaccard, shingles }
