import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!REDIS_URL) {
    console.log("[Redis] REDIS_URL not configured, caching disabled");
    return null;
  }

  if (!redis) {
    try {
      redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });

      redis.on("connect", () => {
        console.log("[Redis] Connected successfully");
      });

      redis.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });

      redis.on("close", () => {
        console.log("[Redis] Connection closed");
      });

      redis.connect().catch((err) => {
        console.error("[Redis] Failed to connect:", err.message);
        redis = null;
      });
    } catch (err: any) {
      console.error("[Redis] Initialization error:", err.message);
      redis = null;
    }
  }

  return redis;
}

const DEFAULT_TTL = 300;
const SHORT_TTL = 60;
const LONG_TTL = 3600;

export const CacheKeys = {
  plans: () => "plans:all",
  plan: (id: number) => `plan:${id}`,
  user: (id: string) => `user:${id}`,
  userOffers: (userId: string) => `user:${userId}:offers`,
  userDomains: (userId: string) => `user:${userId}:domains`,
  userSharedDomains: (userId: string) => `user:${userId}:sharedDomains`,
  sharedDomains: () => "sharedDomains:all",
  offer: (id: number) => `offer:${id}`,
  offerBySlug: (slug: string, domainId?: number, sharedDomainId?: number) => 
    `offer:slug:${slug}:d${domainId || 0}:s${sharedDomainId || 0}`,
  geoIp: (ip: string) => `geoip:${ip}`,
  ipInfo: (ip: string) => `ipinfo:${ip}`,
  dashboardStats: (userId: string) => `dashboard:${userId}`,
  adminDashboard: () => "admin:dashboard",
  clickStats: (userId: string) => `clicks:${userId}`,
};

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (err: any) {
    console.error("[Redis] Get error:", err.message);
    return null;
  }
}

export async function cacheSet(key: string, value: any, ttl: number = DEFAULT_TTL): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (err: any) {
    console.error("[Redis] Set error:", err.message);
    return false;
  }
}

export async function cacheDel(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.del(key);
    return true;
  } catch (err: any) {
    console.error("[Redis] Del error:", err.message);
    return false;
  }
}

export async function cacheDelPattern(pattern: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
    return true;
  } catch (err: any) {
    console.error("[Redis] Del pattern error:", err.message);
    return false;
  }
}

export async function invalidateUserCache(userId: string): Promise<void> {
  await Promise.all([
    cacheDel(CacheKeys.user(userId)),
    cacheDel(CacheKeys.userOffers(userId)),
    cacheDel(CacheKeys.userDomains(userId)),
    cacheDel(CacheKeys.userSharedDomains(userId)),
    cacheDel(CacheKeys.dashboardStats(userId)),
    cacheDel(CacheKeys.clickStats(userId)),
  ]);
}

export async function invalidatePlansCache(): Promise<void> {
  await Promise.all([
    cacheDel(CacheKeys.plans()),
    cacheDelPattern("plan:*"),
  ]);
}

export async function invalidateSharedDomainsCache(): Promise<void> {
  await Promise.all([
    cacheDel(CacheKeys.sharedDomains()),
    cacheDelPattern("user:*:sharedDomains"),
  ]);
}

export async function cacheGeoIp(ip: string, country: string): Promise<void> {
  await cacheSet(CacheKeys.geoIp(ip), { country }, LONG_TTL);
}

export async function getCachedGeoIp(ip: string): Promise<string | null> {
  const data = await cacheGet<{ country: string }>(CacheKeys.geoIp(ip));
  return data?.country || null;
}

// IP Info cache for datacenter detection
export interface IpInfoData {
  country: string;
  isp: string;
  org: string;
  as: string;
  hosting: boolean;
  proxy: boolean;
  mobile: boolean;
}

export async function cacheIpInfo(ip: string, data: IpInfoData): Promise<void> {
  await cacheSet(CacheKeys.ipInfo(ip), data, LONG_TTL);
}

export async function getCachedIpInfo(ip: string): Promise<IpInfoData | null> {
  return await cacheGet<IpInfoData>(CacheKeys.ipInfo(ip));
}

export { DEFAULT_TTL, SHORT_TTL, LONG_TTL };
