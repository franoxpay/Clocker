import { randomBytes } from 'crypto';
import { getRedisClient } from './redis';

// ============================================================
// Challenge Token Store — Redis-backed, one-time-use, with TTL
// ============================================================
// Fallback to in-memory Map only in development when Redis is
// unavailable. In production, Redis unavailability is a safe
// failure: callers receive null and must redirect to white page.
// ============================================================

const IS_DEV = process.env.NODE_ENV !== 'production';

export const CHALLENGE_TTL_S = 30;   // 30 s — matches original CHALLENGE_EXPIRY_MS
export const CHALLENGE_TTL_MS = CHALLENGE_TTL_S * 1000;
export const TIKTOK2_TTL_S = 15;    // 15 s — matches original TIKTOK2_BAIT_EXPIRY_MS
export const TIKTOK2_TTL_MS = TIKTOK2_TTL_S * 1000;

// ---- Interfaces ------------------------------------------------

export interface ChallengeData {
  offerId: number;
  slug: string;
  targetUrl: string;
  redirectType: 'black' | 'white';
  ip: string;
  userAgent: string;
  createdAt: number;
  queryParams: Record<string, any>;
  honeypotTriggered: boolean;
  verifiedAt: number | null;
  verifiedScore: number | null;
  verificationNonce: string | null;
  userId: string;
  country: string;
  device: 'smartphone' | 'tablet' | 'desktop';
  requestUrl: string;
  platform: string;
  referer: string;
  ttclid: string | null;
  fbcl: string | null;
  cname: string | null;
}

export interface TikTok2BaitData {
  offerId: number;
  slug: string;
  blackUrl: string;
  whiteUrl: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  queryParams: Record<string, any>;
  userId: string;
  country: string;
  device: 'smartphone' | 'tablet' | 'desktop';
  requestUrl: string;
  referer: string;
  ttclid: string | null;
  adname: string | null;
  adset: string | null;
  cname: string | null;
  xcode: string | null;
  domainId: number | null;
}

// ---- Dev-only in-memory fallback Maps --------------------------
// These are ONLY used when NODE_ENV !== 'production' AND Redis is
// unreachable. They are logged with a warning each time they fire.

const devChallengeMap = new Map<string, ChallengeData>();
const devTikTok2Map = new Map<string, TikTok2BaitData>();

// ---- Token generation ------------------------------------------

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// ---- Low-level Redis helpers -----------------------------------

function shortKey(key: string): string {
  return key.substring(0, 28) + '...';
}

async function redisGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err: any) {
    console.error(`[ChallengeStore] Redis GET error (${shortKey(key)}):`, err.message);
    return null;
  }
}

async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (err: any) {
    console.error(`[ChallengeStore] Redis SET error (${shortKey(key)}):`, err.message);
    return false;
  }
}

async function redisDel(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err: any) {
    console.error(`[ChallengeStore] Redis DEL error (${shortKey(key)}):`, err.message);
  }
}

// Atomic GET + DEL via Lua — guarantees one-time-use even under
// concurrent requests. Returns the stored value and removes it
// in a single round-trip.
async function redisGetAndDel<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const result = (await client.eval(
      "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v",
      1,
      key,
    )) as string | null;
    return result ? (JSON.parse(result) as T) : null;
  } catch (err: any) {
    console.error(`[ChallengeStore] Redis GET+DEL error (${shortKey(key)}):`, err.message);
    return null;
  }
}

async function redisGetTtl(key: string): Promise<number> {
  const client = getRedisClient();
  if (!client) return CHALLENGE_TTL_S;
  try {
    const ttl = await client.ttl(key);
    return ttl > 0 ? ttl : CHALLENGE_TTL_S;
  } catch {
    return CHALLENGE_TTL_S;
  }
}

// ---- Key helpers -----------------------------------------------

const CHALLENGE_PREFIX = 'challenge:';
const TIKTOK2_PREFIX = 'tt2bait:';

function cKey(token: string): string {
  return `${CHALLENGE_PREFIX}${token}`;
}

function t2Key(token: string): string {
  return `${TIKTOK2_PREFIX}${token}`;
}

// ================================================================
// CHALLENGE TOKEN API
// ================================================================

/** Store a new challenge token in Redis with TTL.
 *  Returns false if Redis is unavailable (caller must serve white page). */
export async function createChallengeToken(
  token: string,
  data: ChallengeData,
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) {
      console.warn(
        `[ChallengeStore] DEV FALLBACK — Redis unavailable, storing challenge token in memory: ${token.substring(0, 16)}...`,
      );
      devChallengeMap.set(token, data);
      return true;
    }
    console.error(
      '[ChallengeStore] Redis unavailable — cannot store challenge token. Safe fallback: white page.',
    );
    return false;
  }

  const saved = await redisSet(cKey(token), data, CHALLENGE_TTL_S);
  if (saved) {
    console.log(
      `[ChallengeStore] Challenge token created: ${token.substring(0, 16)}... (TTL: ${CHALLENGE_TTL_S}s)`,
    );
  } else {
    console.error(
      `[ChallengeStore] Failed to store challenge token: ${token.substring(0, 16)}...`,
    );
  }
  return saved;
}

/** Read a challenge token without consuming it. */
export async function getChallengeToken(token: string): Promise<ChallengeData | null> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) return devChallengeMap.get(token) ?? null;
    console.error('[ChallengeStore] Redis unavailable — cannot read challenge token.');
    return null;
  }

  const data = await redisGet<ChallengeData>(cKey(token));
  if (!data) {
    console.log(
      `[ChallengeStore] Challenge token not found / expired: ${token.substring(0, 16)}...`,
    );
  }
  return data;
}

/** Partially update a stored challenge token (preserves remaining TTL). */
export async function updateChallengeToken(
  token: string,
  updates: Partial<ChallengeData>,
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) {
      const existing = devChallengeMap.get(token);
      if (existing) devChallengeMap.set(token, { ...existing, ...updates });
      return !!existing;
    }
    return false;
  }

  const key = cKey(token);
  const existing = await redisGet<ChallengeData>(key);
  if (!existing) return false;

  const remainingTtl = await redisGetTtl(key);
  const updated: ChallengeData = { ...existing, ...updates };
  return redisSet(key, updated, remainingTtl);
}

/** Consume a challenge token atomically (read + delete). One-time use.
 *  Returns null if token doesn't exist, is expired, or was already used. */
export async function consumeChallengeToken(token: string): Promise<ChallengeData | null> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) {
      const data = devChallengeMap.get(token) ?? null;
      if (data) devChallengeMap.delete(token);
      return data;
    }
    console.error('[ChallengeStore] Redis unavailable — cannot consume challenge token. Safe fallback: white page.');
    return null;
  }

  const data = await redisGetAndDel<ChallengeData>(cKey(token));
  if (data) {
    console.log(
      `[ChallengeStore] Challenge token consumed (one-time use): ${token.substring(0, 16)}...`,
    );
  } else {
    console.log(
      `[ChallengeStore] Challenge token not found / already consumed: ${token.substring(0, 16)}...`,
    );
  }
  return data;
}

/** Explicitly delete a challenge token (e.g. after honeypot cleanup). */
export async function deleteChallengeToken(token: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) devChallengeMap.delete(token);
    return;
  }
  await redisDel(cKey(token));
}

// ================================================================
// TIKTOK 2 BAIT TOKEN API
// ================================================================

/** Store a new TikTok2 bait token in Redis with TTL.
 *  Returns false if Redis is unavailable (caller must serve white page). */
export async function createTikTok2Token(
  token: string,
  data: TikTok2BaitData,
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) {
      console.warn(
        `[ChallengeStore] DEV FALLBACK — Redis unavailable, storing TikTok2 bait token in memory: ${token.substring(0, 16)}...`,
      );
      devTikTok2Map.set(token, data);
      return true;
    }
    console.error(
      '[ChallengeStore] Redis unavailable — cannot store TikTok2 bait token. Safe fallback: white page.',
    );
    return false;
  }

  const saved = await redisSet(t2Key(token), data, TIKTOK2_TTL_S);
  if (saved) {
    console.log(
      `[ChallengeStore] TikTok2 bait token created: ${token.substring(0, 16)}... (TTL: ${TIKTOK2_TTL_S}s)`,
    );
  } else {
    console.error(
      `[ChallengeStore] Failed to store TikTok2 bait token: ${token.substring(0, 16)}...`,
    );
  }
  return saved;
}

/** Read a TikTok2 bait token without consuming it. */
export async function getTikTok2Token(token: string): Promise<TikTok2BaitData | null> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) return devTikTok2Map.get(token) ?? null;
    return null;
  }

  const data = await redisGet<TikTok2BaitData>(t2Key(token));
  if (!data) {
    console.log(
      `[ChallengeStore] TikTok2 token not found / expired: ${token.substring(0, 16)}...`,
    );
  }
  return data;
}

/** Consume a TikTok2 bait token atomically (read + delete). One-time use. */
export async function consumeTikTok2Token(token: string): Promise<TikTok2BaitData | null> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) {
      const data = devTikTok2Map.get(token) ?? null;
      if (data) devTikTok2Map.delete(token);
      return data;
    }
    console.error('[ChallengeStore] Redis unavailable — cannot consume TikTok2 bait token.');
    return null;
  }

  const data = await redisGetAndDel<TikTok2BaitData>(t2Key(token));
  if (data) {
    console.log(
      `[ChallengeStore] TikTok2 bait token consumed: ${token.substring(0, 16)}...`,
    );
  } else {
    console.log(
      `[ChallengeStore] TikTok2 token not found / already consumed: ${token.substring(0, 16)}...`,
    );
  }
  return data;
}

/** Explicitly delete a TikTok2 bait token. */
export async function deleteTikTok2Token(token: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    if (IS_DEV) devTikTok2Map.delete(token);
    return;
  }
  await redisDel(t2Key(token));
}
