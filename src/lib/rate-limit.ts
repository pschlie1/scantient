import { Redis } from "@upstash/redis";

interface RateLimitEntry {
  timestamps: number[];
}

const memoryStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 3600_000);
    if (entry.timestamps.length === 0) memoryStore.delete(key);
  }
}, 60_000);

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxAttempts: number;
  /** Window size in milliseconds */
  windowMs: number;
  /**
   * Fallback mode when distributed backend is unavailable.
   * - fail-open: allow request and fallback to local memory limiter
   * - fail-closed: deny request with a safe Retry-After value
   */
  fallbackMode?: "fail-open" | "fail-closed";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function memoryRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key) ?? { timestamps: [] };

  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  if (entry.timestamps.length >= config.maxAttempts) {
    const oldest = entry.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + config.windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.timestamps.push(now);
  memoryStore.set(key, entry);
  return { allowed: true };
}

function backendKey(key: string) {
  const prefix = process.env.RATE_LIMIT_PREFIX ?? "vibesafe:rate-limit";
  return `${prefix}:${key}`;
}

function resolveFallbackMode(config: RateLimitConfig) {
  if (config.fallbackMode) return config.fallbackMode;
  return process.env.RATE_LIMIT_FALLBACK_MODE === "fail-closed" ? "fail-closed" : "fail-open";
}

export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedisClient();

  if (!redis) {
    return memoryRateLimit(key, config);
  }

  const redisKey = backendKey(key);

  try {
    const count = await redis.incr(redisKey);

    if (count === 1) {
      await redis.expire(redisKey, Math.ceil(config.windowMs / 1000));
    }

    if (count > config.maxAttempts) {
      const ttl = await redis.ttl(redisKey);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : 60 };
    }

    return { allowed: true };
  } catch (error) {
    const fallbackMode = resolveFallbackMode(config);

    console.error("[rate-limit] Distributed backend unavailable", {
      key,
      fallbackMode,
      message: error instanceof Error ? error.message : "unknown",
    });

    if (fallbackMode === "fail-closed") {
      return { allowed: false, retryAfterSeconds: 60 };
    }

    return memoryRateLimit(key, config);
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
