import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  plans,
  domains,
  sharedDomains,
  offers,
  clickLogs,
  dailyClickMetrics,
  notifications,
  adminSettings,
  passwordResetTokens,
  adminImpersonations,
  type User,
  type InsertUser,
  type UpsertUser,
  type Plan,
  type InsertPlan,
  type Domain,
  type InsertDomain,
  type SharedDomain,
  type InsertSharedDomain,
  type Offer,
  type InsertOffer,
  type ClickLog,
  type InsertClickLog,
  type Notification,
  type InsertNotification,
  type AdminSettings,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(page: number, limit: number, search?: string): Promise<{ users: User[]; total: number }>;
  deleteUserWithCascade(userId: string): Promise<void>;

  getPlan(id: number): Promise<Plan | undefined>;
  getAllPlans(): Promise<Plan[]>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<InsertPlan>): Promise<Plan | undefined>;

  getDomain(id: number): Promise<Domain | undefined>;
  getDomainBySubdomain(subdomain: string): Promise<Domain | undefined>;
  getDomainsByUserId(userId: string): Promise<Domain[]>;
  createDomain(domain: InsertDomain): Promise<Domain>;
  updateDomain(id: number, data: Partial<InsertDomain>): Promise<Domain | undefined>;
  deleteDomain(id: number): Promise<void>;

  getSharedDomain(id: number): Promise<SharedDomain | undefined>;
  getSharedDomainBySubdomain(subdomain: string): Promise<SharedDomain | undefined>;
  getAllSharedDomains(): Promise<SharedDomain[]>;
  getActiveSharedDomains(): Promise<SharedDomain[]>;
  createSharedDomain(domain: InsertSharedDomain): Promise<SharedDomain>;
  updateSharedDomain(id: number, data: Partial<InsertSharedDomain>): Promise<SharedDomain | undefined>;
  deleteSharedDomain(id: number): Promise<void>;

  getOffer(id: number): Promise<Offer | undefined>;
  getOfferBySlug(slug: string): Promise<Offer | undefined>;
  getOfferBySlugAndDomain(slug: string, domainId: number | null): Promise<Offer | undefined>;
  getOfferBySlugAndSharedDomain(slug: string, sharedDomainId: number): Promise<Offer | undefined>;
  getOffersByUserId(userId: string): Promise<Offer[]>;
  createOffer(offer: InsertOffer & { xcode: string }): Promise<Offer>;
  updateOffer(id: number, data: Partial<InsertOffer>): Promise<Offer | undefined>;
  deleteOffer(id: number): Promise<void>;
  incrementOfferClicks(id: number, isBlack: boolean): Promise<void>;

  createClickLog(log: InsertClickLog): Promise<ClickLog>;
  getClickLogs(
    userId: string,
    page: number,
    limit: number,
    filters?: { offerId?: number; domainId?: number; redirectType?: string; platform?: string }
  ): Promise<{ logs: ClickLog[]; total: number }>;
  getClickLogsLast7Days(userId: string): Promise<Array<{ date: string; clicks: number; blackClicks: number; whiteClicks: number }>>;
  cleanupOldClickLogs(): Promise<void>;

  getNotificationsByUserId(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<void>;

  getAdminSettings(): Promise<AdminSettings | undefined>;
  updateAdminSettings(data: Partial<AdminSettings>): Promise<AdminSettings>;

  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined>;
  usePasswordResetToken(token: string): Promise<void>;

  createAdminImpersonation(adminId: string, targetUserId: string, sessionToken: string, expiresAt: Date): Promise<void>;
  getAdminImpersonation(sessionToken: string): Promise<{ adminId: string; targetUserId: string } | undefined>;
  deleteAdminImpersonation(sessionToken: string): Promise<void>;

  getSystemMetrics72h(): Promise<{
    totalClicks: number;
    successfulClicks: number;
    failedClicks: number;
    avgResponseTimeMs: number;
    minResponseTimeMs: number;
    maxResponseTimeMs: number;
    clicksByHour: Array<{
      hour: string;
      total: number;
      successful: number;
      failed: number;
      avgResponseTime: number;
    }>;
    slowestRequests: Array<{
      id: number;
      responseTimeMs: number;
      country: string | null;
      device: string | null;
      createdAt: Date;
      hasError: boolean | null;
      redirectedTo: string | null;
      platform: string | null;
      allParams: Record<string, string> | null;
    }>;
  }>;

  getAdminDashboardMetrics(platform?: string): Promise<{
    clicksToday: { total: number; black: number; white: number; failed: number };
    clicksLast7Days: { total: number; black: number; white: number; failed: number };
    clicksByDay: Array<{ date: string; total: number; black: number; white: number; failed: number }>;
    usersTotal: { total: number; paid: number; free: number };
    usersByPlan: Array<{ planId: number; planName: string; count: number }>;
  }>;

  getUsersNewByPeriod(period: '7d' | '30d' | '1y'): Promise<Array<{ date: string; count: number }>>;

  getUsersRanking(
    page: number,
    limit: number,
    period: 'today' | '7d' | '30d',
    platform?: string
  ): Promise<{
    users: Array<{
      id: string;
      email: string;
      planName: string | null;
      totalClicks: number;
      clicksToday: number;
    }>;
    total: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async upsertUser(user: UpsertUser): Promise<User> {
    const existing = user.id ? await this.getUser(user.id) : undefined;
    if (existing) {
      const [updated] = await db
        .update(users)
        .set({ ...user, updatedAt: new Date() })
        .where(eq(users.id, user.id!))
        .returning();
      return updated;
    }
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getAllUsers(page: number, limit: number, search?: string): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;
    
    let query = db.select().from(users);
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(users);
    
    if (search) {
      const searchPattern = `%${search}%`;
      query = query.where(sql`${users.email} ILIKE ${searchPattern}`) as any;
      countQuery = countQuery.where(sql`${users.email} ILIKE ${searchPattern}`) as any;
    }
    
    const [{ count }] = await countQuery;
    const result = await query.orderBy(desc(users.createdAt)).limit(limit).offset(offset);
    
    return { users: result, total: Number(count) };
  }

  async deleteUserWithCascade(userId: string): Promise<void> {
    await db.delete(clickLogs).where(eq(clickLogs.userId, userId));
    await db.delete(dailyClickMetrics).where(eq(dailyClickMetrics.userId, userId));
    await db.delete(notifications).where(eq(notifications.userId, userId));
    await db.delete(offers).where(eq(offers.userId, userId));
    await db.delete(domains).where(eq(domains.userId, userId));
    await db.delete(adminImpersonations).where(eq(adminImpersonations.targetUserId, userId));
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  async getPlan(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return plan;
  }

  async getAllPlans(): Promise<Plan[]> {
    return db.select().from(plans).orderBy(plans.price);
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    const [created] = await db.insert(plans).values(plan).returning();
    return created;
  }

  async updatePlan(id: number, data: Partial<InsertPlan>): Promise<Plan | undefined> {
    const [updated] = await db
      .update(plans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return updated;
  }

  async getDomain(id: number): Promise<Domain | undefined> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
    return domain;
  }

  async getDomainBySubdomain(subdomain: string): Promise<Domain | undefined> {
    // Normalize the subdomain: lowercase and remove www prefix
    const normalizedSubdomain = subdomain.toLowerCase().replace(/^www\./, '');
    
    // First try exact match with normalized subdomain
    let [domain] = await db.select().from(domains).where(eq(domains.subdomain, normalizedSubdomain)).limit(1);
    
    if (!domain) {
      // Try with www prefix if not found
      [domain] = await db.select().from(domains).where(eq(domains.subdomain, `www.${normalizedSubdomain}`)).limit(1);
    }
    
    if (!domain) {
      // Try case-insensitive match using SQL LOWER
      [domain] = await db.select().from(domains).where(sql`LOWER(${domains.subdomain}) = ${normalizedSubdomain}`).limit(1);
    }
    
    return domain;
  }

  async getDomainsByUserId(userId: string): Promise<Domain[]> {
    return db.select().from(domains).where(eq(domains.userId, userId)).orderBy(desc(domains.createdAt));
  }

  async createDomain(domain: InsertDomain): Promise<Domain> {
    const [created] = await db.insert(domains).values(domain).returning();
    return created;
  }

  async updateDomain(id: number, data: Partial<InsertDomain>): Promise<Domain | undefined> {
    const [updated] = await db
      .update(domains)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(domains.id, id))
      .returning();
    return updated;
  }

  async deleteDomain(id: number): Promise<void> {
    await db.delete(domains).where(eq(domains.id, id));
  }

  async getSharedDomain(id: number): Promise<SharedDomain | undefined> {
    const [domain] = await db.select().from(sharedDomains).where(eq(sharedDomains.id, id)).limit(1);
    return domain;
  }

  async getSharedDomainBySubdomain(subdomain: string): Promise<SharedDomain | undefined> {
    const [domain] = await db.select().from(sharedDomains).where(eq(sharedDomains.subdomain, subdomain)).limit(1);
    return domain;
  }

  async getAllSharedDomains(): Promise<SharedDomain[]> {
    return db.select().from(sharedDomains).orderBy(desc(sharedDomains.createdAt));
  }

  async getActiveSharedDomains(): Promise<SharedDomain[]> {
    return db.select().from(sharedDomains).where(and(eq(sharedDomains.isActive, true), eq(sharedDomains.isVerified, true))).orderBy(sharedDomains.subdomain);
  }

  async createSharedDomain(domain: InsertSharedDomain): Promise<SharedDomain> {
    const [created] = await db.insert(sharedDomains).values(domain).returning();
    return created;
  }

  async updateSharedDomain(id: number, data: Partial<InsertSharedDomain>): Promise<SharedDomain | undefined> {
    const [updated] = await db
      .update(sharedDomains)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sharedDomains.id, id))
      .returning();
    return updated;
  }

  async deleteSharedDomain(id: number): Promise<void> {
    await db.delete(sharedDomains).where(eq(sharedDomains.id, id));
  }

  async getOffer(id: number): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
    return offer;
  }

  async getOfferBySlug(slug: string): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.slug, slug)).limit(1);
    return offer;
  }

  async getOfferBySlugAndDomain(slug: string, domainId: number | null): Promise<Offer | undefined> {
    const [offer] = await db
      .select()
      .from(offers)
      .where(and(
        eq(offers.slug, slug), 
        domainId === null ? isNull(offers.domainId) : eq(offers.domainId, domainId)
      ))
      .limit(1);
    return offer;
  }

  async getOfferBySlugAndSharedDomain(slug: string, sharedDomainId: number): Promise<Offer | undefined> {
    const [offer] = await db
      .select()
      .from(offers)
      .where(and(
        eq(offers.slug, slug),
        eq(offers.sharedDomainId, sharedDomainId)
      ))
      .limit(1);
    return offer;
  }

  async getOffersByUserId(userId: string): Promise<Offer[]> {
    return db
      .select({
        offer: offers,
        domain: domains,
        sharedDomain: sharedDomains,
      })
      .from(offers)
      .leftJoin(domains, eq(offers.domainId, domains.id))
      .leftJoin(sharedDomains, eq(offers.sharedDomainId, sharedDomains.id))
      .where(eq(offers.userId, userId))
      .orderBy(desc(offers.createdAt))
      .then((rows) =>
        rows.map((row) => ({
          ...row.offer,
          domain: row.domain,
          sharedDomain: row.sharedDomain,
        }))
      ) as any;
  }

  async createOffer(offer: InsertOffer & { xcode: string }): Promise<Offer> {
    const [created] = await db.insert(offers).values(offer).returning();
    return created;
  }

  async updateOffer(id: number, data: Partial<InsertOffer>): Promise<Offer | undefined> {
    const [updated] = await db
      .update(offers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(offers.id, id))
      .returning();
    return updated;
  }

  async deleteOffer(id: number): Promise<void> {
    await db.delete(offers).where(eq(offers.id, id));
  }

  async incrementOfferClicks(id: number, isBlack: boolean): Promise<void> {
    if (isBlack) {
      await db
        .update(offers)
        .set({
          totalClicks: sql`${offers.totalClicks} + 1`,
          blackClicks: sql`${offers.blackClicks} + 1`,
        })
        .where(eq(offers.id, id));
    } else {
      await db
        .update(offers)
        .set({
          totalClicks: sql`${offers.totalClicks} + 1`,
          whiteClicks: sql`${offers.whiteClicks} + 1`,
        })
        .where(eq(offers.id, id));
    }
  }

  async createClickLog(log: InsertClickLog): Promise<ClickLog> {
    const [created] = await db.insert(clickLogs).values(log).returning();
    return created;
  }

  async getClickLogs(
    userId: string,
    page: number,
    limit: number,
    filters?: { offerId?: number; domainId?: number; redirectType?: string; platform?: string; startDate?: string; endDate?: string }
  ): Promise<{ logs: ClickLog[]; total: number }> {
    const offset = (page - 1) * limit;
    const conditions = [eq(clickLogs.userId, userId)];

    if (filters?.offerId) {
      conditions.push(eq(clickLogs.offerId, filters.offerId));
    }
    if (filters?.redirectType) {
      conditions.push(eq(clickLogs.redirectedTo, filters.redirectType));
    }
    if (filters?.startDate) {
      conditions.push(gte(clickLogs.createdAt, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(clickLogs.createdAt, endDate));
    }

    const whereClause = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clickLogs)
      .where(whereClause);

    const logsResult = await db
      .select({
        log: clickLogs,
        offer: offers,
      })
      .from(clickLogs)
      .leftJoin(offers, eq(clickLogs.offerId, offers.id))
      .where(whereClause)
      .orderBy(desc(clickLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      logs: logsResult.map((row) => ({ ...row.log, offer: row.offer })) as any,
      total: Number(count),
    };
  }

  async getClickLogsLast7Days(userId: string): Promise<Array<{ date: string; clicks: number; blackClicks: number; whiteClicks: number }>> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await db
      .select({
        date: sql<string>`DATE(${clickLogs.createdAt})`,
        clicks: sql<number>`COUNT(*)`,
        blackClicks: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'black' THEN 1 ELSE 0 END)`,
        whiteClicks: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'white' THEN 1 ELSE 0 END)`,
      })
      .from(clickLogs)
      .where(and(eq(clickLogs.userId, userId), gte(clickLogs.createdAt, sevenDaysAgo)))
      .groupBy(sql`DATE(${clickLogs.createdAt})`)
      .orderBy(sql`DATE(${clickLogs.createdAt})`);

    return result.map((row) => ({
      date: row.date,
      clicks: Number(row.clicks),
      blackClicks: Number(row.blackClicks),
      whiteClicks: Number(row.whiteClicks),
    }));
  }

  async cleanupOldClickLogs(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    await db.delete(clickLogs).where(lte(clickLogs.createdAt, sevenDaysAgo));
  }

  async getNotificationsByUserId(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationAsRead(id: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async getAdminSettings(): Promise<AdminSettings | undefined> {
    const [settings] = await db.select().from(adminSettings).limit(1);
    return settings;
  }

  async updateAdminSettings(data: Partial<AdminSettings>): Promise<AdminSettings> {
    const existing = await this.getAdminSettings();
    if (existing) {
      const [updated] = await db
        .update(adminSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(adminSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(adminSettings).values(data as any).returning();
    return created;
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  }

  async getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined> {
    const [result] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.token, token), sql`${passwordResetTokens.usedAt} IS NULL`))
      .limit(1);
    return result ? { userId: result.userId, expiresAt: result.expiresAt } : undefined;
  }

  async usePasswordResetToken(token: string): Promise<void> {
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.token, token));
  }

  async createAdminImpersonation(adminId: string, targetUserId: string, sessionToken: string, expiresAt: Date): Promise<void> {
    await db.insert(adminImpersonations).values({ adminId, targetUserId, sessionToken, expiresAt });
  }

  async getAdminImpersonation(sessionToken: string): Promise<{ adminId: string; targetUserId: string } | undefined> {
    const [result] = await db
      .select()
      .from(adminImpersonations)
      .where(and(eq(adminImpersonations.sessionToken, sessionToken), gte(adminImpersonations.expiresAt, new Date())))
      .limit(1);
    return result ? { adminId: result.adminId, targetUserId: result.targetUserId } : undefined;
  }

  async deleteAdminImpersonation(sessionToken: string): Promise<void> {
    await db.delete(adminImpersonations).where(eq(adminImpersonations.sessionToken, sessionToken));
  }

  async getSystemMetrics72h(): Promise<{
    totalClicks: number;
    successfulClicks: number;
    failedClicks: number;
    avgResponseTimeMs: number;
    minResponseTimeMs: number;
    maxResponseTimeMs: number;
    clicksByHour: Array<{
      hour: string;
      total: number;
      successful: number;
      failed: number;
      avgResponseTime: number;
    }>;
    slowestRequests: Array<{
      id: number;
      responseTimeMs: number;
      country: string | null;
      device: string | null;
      createdAt: Date;
      hasError: boolean | null;
      redirectedTo: string | null;
      platform: string | null;
      allParams: Record<string, string> | null;
    }>;
  }> {
    const hours72Ago = new Date();
    hours72Ago.setHours(hours72Ago.getHours() - 72);

    // Get overall stats
    const [overallStats] = await db
      .select({
        totalClicks: sql<number>`COUNT(*)`,
        successfulClicks: sql<number>`SUM(CASE WHEN ${clickLogs.hasError} = false OR ${clickLogs.hasError} IS NULL THEN 1 ELSE 0 END)`,
        failedClicks: sql<number>`SUM(CASE WHEN ${clickLogs.hasError} = true THEN 1 ELSE 0 END)`,
        avgResponseTimeMs: sql<number>`COALESCE(AVG(${clickLogs.responseTimeMs}), 0)`,
        minResponseTimeMs: sql<number>`COALESCE(MIN(${clickLogs.responseTimeMs}), 0)`,
        maxResponseTimeMs: sql<number>`COALESCE(MAX(${clickLogs.responseTimeMs}), 0)`,
      })
      .from(clickLogs)
      .where(gte(clickLogs.createdAt, hours72Ago));

    // Get hourly breakdown
    const hourlyStats = await db
      .select({
        hour: sql<string>`TO_CHAR(${clickLogs.createdAt}, 'YYYY-MM-DD HH24:00')`,
        total: sql<number>`COUNT(*)`,
        successful: sql<number>`SUM(CASE WHEN ${clickLogs.hasError} = false OR ${clickLogs.hasError} IS NULL THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${clickLogs.hasError} = true THEN 1 ELSE 0 END)`,
        avgResponseTime: sql<number>`COALESCE(AVG(${clickLogs.responseTimeMs}), 0)`,
      })
      .from(clickLogs)
      .where(gte(clickLogs.createdAt, hours72Ago))
      .groupBy(sql`TO_CHAR(${clickLogs.createdAt}, 'YYYY-MM-DD HH24:00')`)
      .orderBy(sql`TO_CHAR(${clickLogs.createdAt}, 'YYYY-MM-DD HH24:00')`);

    // Get slowest requests with platform from offers
    const slowestRequests = await db
      .select({
        id: clickLogs.id,
        responseTimeMs: clickLogs.responseTimeMs,
        country: clickLogs.country,
        device: clickLogs.device,
        createdAt: clickLogs.createdAt,
        hasError: clickLogs.hasError,
        redirectedTo: clickLogs.redirectedTo,
        platform: offers.platform,
        allParams: clickLogs.allParams,
      })
      .from(clickLogs)
      .leftJoin(offers, eq(clickLogs.offerId, offers.id))
      .where(gte(clickLogs.createdAt, hours72Ago))
      .orderBy(sql`${clickLogs.responseTimeMs} DESC NULLS LAST`)
      .limit(20);

    return {
      totalClicks: Number(overallStats?.totalClicks || 0),
      successfulClicks: Number(overallStats?.successfulClicks || 0),
      failedClicks: Number(overallStats?.failedClicks || 0),
      avgResponseTimeMs: Math.round(Number(overallStats?.avgResponseTimeMs || 0)),
      minResponseTimeMs: Number(overallStats?.minResponseTimeMs || 0),
      maxResponseTimeMs: Number(overallStats?.maxResponseTimeMs || 0),
      clicksByHour: hourlyStats.map(row => ({
        hour: row.hour,
        total: Number(row.total),
        successful: Number(row.successful),
        failed: Number(row.failed),
        avgResponseTime: Math.round(Number(row.avgResponseTime)),
      })),
      slowestRequests: slowestRequests.map(row => ({
        id: row.id,
        responseTimeMs: row.responseTimeMs ?? 0,
        country: row.country,
        device: row.device,
        createdAt: row.createdAt,
        hasError: row.hasError,
        redirectedTo: row.redirectedTo,
        platform: row.platform,
        allParams: row.allParams as Record<string, string> | null,
      })),
    };
  }

  async getAdminDashboardMetrics(platform?: string): Promise<{
    clicksToday: { total: number; black: number; white: number; failed: number };
    clicksLast7Days: { total: number; black: number; white: number; failed: number };
    clicksByDay: Array<{ date: string; total: number; black: number; white: number; failed: number }>;
    usersTotal: { total: number; paid: number; free: number };
    usersByPlan: Array<{ planId: number; planName: string; count: number }>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days7Ago = new Date(today);
    days7Ago.setDate(days7Ago.getDate() - 7);

    const buildPlatformConditions = (dateCondition: any) => {
      if (platform && platform !== 'all') {
        return and(dateCondition, eq(offers.platform, platform));
      }
      return dateCondition;
    };

    const [todayStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        black: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'black' THEN 1 ELSE 0 END)`,
        white: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'white' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${clickLogs.hasError} = true THEN 1 ELSE 0 END)`,
      })
      .from(clickLogs)
      .leftJoin(offers, eq(clickLogs.offerId, offers.id))
      .where(buildPlatformConditions(gte(clickLogs.createdAt, today)));

    const [last7DaysStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        black: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'black' THEN 1 ELSE 0 END)`,
        white: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'white' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${clickLogs.hasError} = true THEN 1 ELSE 0 END)`,
      })
      .from(clickLogs)
      .leftJoin(offers, eq(clickLogs.offerId, offers.id))
      .where(buildPlatformConditions(gte(clickLogs.createdAt, days7Ago)));

    const dailyStats = await db
      .select({
        date: sql<string>`TO_CHAR(${clickLogs.createdAt}, 'YYYY-MM-DD')`,
        total: sql<number>`COUNT(*)`,
        black: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'black' THEN 1 ELSE 0 END)`,
        white: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'white' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${clickLogs.hasError} = true THEN 1 ELSE 0 END)`,
      })
      .from(clickLogs)
      .leftJoin(offers, eq(clickLogs.offerId, offers.id))
      .where(buildPlatformConditions(gte(clickLogs.createdAt, days7Ago)))
      .groupBy(sql`TO_CHAR(${clickLogs.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${clickLogs.createdAt}, 'YYYY-MM-DD')`);

    const [userStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        paid: sql<number>`SUM(CASE WHEN ${users.planId} IS NOT NULL AND ${users.planId} > 0 THEN 1 ELSE 0 END)`,
        free: sql<number>`SUM(CASE WHEN ${users.planId} IS NULL OR ${users.planId} = 0 THEN 1 ELSE 0 END)`,
      })
      .from(users);

    const planStats = await db
      .select({
        planId: plans.id,
        planName: plans.name,
        count: sql<number>`COUNT(${users.id})`,
      })
      .from(plans)
      .leftJoin(users, eq(users.planId, plans.id))
      .groupBy(plans.id, plans.name)
      .orderBy(sql`COUNT(${users.id}) DESC`);

    return {
      clicksToday: {
        total: Number(todayStats?.total || 0),
        black: Number(todayStats?.black || 0),
        white: Number(todayStats?.white || 0),
        failed: Number(todayStats?.failed || 0),
      },
      clicksLast7Days: {
        total: Number(last7DaysStats?.total || 0),
        black: Number(last7DaysStats?.black || 0),
        white: Number(last7DaysStats?.white || 0),
        failed: Number(last7DaysStats?.failed || 0),
      },
      clicksByDay: dailyStats.map(row => ({
        date: row.date,
        total: Number(row.total),
        black: Number(row.black),
        white: Number(row.white),
        failed: Number(row.failed),
      })),
      usersTotal: {
        total: Number(userStats?.total || 0),
        paid: Number(userStats?.paid || 0),
        free: Number(userStats?.free || 0),
      },
      usersByPlan: planStats.map(row => ({
        planId: row.planId,
        planName: row.planName,
        count: Number(row.count),
      })),
    };
  }

  async getUsersNewByPeriod(period: '7d' | '30d' | '1y'): Promise<Array<{ date: string; count: number }>> {
    const now = new Date();
    let startDate: Date;
    let groupFormat: string;

    switch (period) {
      case '7d':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        groupFormat = 'YYYY-MM-DD';
        break;
      case '30d':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        groupFormat = 'YYYY-MM-DD';
        break;
      case '1y':
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        groupFormat = 'YYYY-MM';
        break;
    }

    const result = await db
      .select({
        date: sql<string>`TO_CHAR(${users.createdAt}, ${groupFormat})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(gte(users.createdAt, startDate))
      .groupBy(sql`TO_CHAR(${users.createdAt}, ${groupFormat})`)
      .orderBy(sql`TO_CHAR(${users.createdAt}, ${groupFormat})`);

    return result.map(row => ({
      date: row.date,
      count: Number(row.count),
    }));
  }

  async getUsersRanking(
    page: number,
    limit: number,
    period: 'today' | '7d' | '30d',
    platform?: string
  ): Promise<{
    users: Array<{
      id: string;
      email: string;
      planName: string | null;
      totalClicks: number;
      clicksToday: number;
    }>;
    total: number;
  }> {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let periodStart: Date;
    switch (period) {
      case 'today':
        periodStart = today;
        break;
      case '7d':
        periodStart = new Date(today);
        periodStart.setDate(periodStart.getDate() - 7);
        break;
      case '30d':
        periodStart = new Date(today);
        periodStart.setDate(periodStart.getDate() - 30);
        break;
    }

    const offset = (page - 1) * limit;

    const baseConditions = [gte(clickLogs.createdAt, periodStart)];
    
    const buildQuery = () => {
      if (platform && platform !== 'all') {
        return db
          .select({
            userId: users.id,
            email: users.email,
            planName: plans.name,
            totalClicks: sql<number>`COUNT(${clickLogs.id})`,
            clicksToday: sql<number>`SUM(CASE WHEN ${clickLogs.createdAt} >= ${today} THEN 1 ELSE 0 END)`,
          })
          .from(users)
          .leftJoin(plans, eq(users.planId, plans.id))
          .innerJoin(clickLogs, eq(clickLogs.userId, users.id))
          .innerJoin(offers, eq(clickLogs.offerId, offers.id))
          .where(and(...baseConditions, eq(offers.platform, platform)))
          .groupBy(users.id, users.email, plans.name)
          .having(sql`COUNT(${clickLogs.id}) > 0`)
          .orderBy(sql`COUNT(${clickLogs.id}) DESC`)
          .limit(limit)
          .offset(offset);
      }
      return db
        .select({
          userId: users.id,
          email: users.email,
          planName: plans.name,
          totalClicks: sql<number>`COUNT(${clickLogs.id})`,
          clicksToday: sql<number>`SUM(CASE WHEN ${clickLogs.createdAt} >= ${today} THEN 1 ELSE 0 END)`,
        })
        .from(users)
        .leftJoin(plans, eq(users.planId, plans.id))
        .innerJoin(clickLogs, eq(clickLogs.userId, users.id))
        .where(and(...baseConditions))
        .groupBy(users.id, users.email, plans.name)
        .having(sql`COUNT(${clickLogs.id}) > 0`)
        .orderBy(sql`COUNT(${clickLogs.id}) DESC`)
        .limit(limit)
        .offset(offset);
    };

    const rankingQuery = await buildQuery();

    const buildCountQuery = () => {
      if (platform && platform !== 'all') {
        return db
          .select({ count: sql<number>`COUNT(DISTINCT ${users.id})` })
          .from(users)
          .innerJoin(clickLogs, eq(clickLogs.userId, users.id))
          .innerJoin(offers, eq(clickLogs.offerId, offers.id))
          .where(and(...baseConditions, eq(offers.platform, platform)));
      }
      return db
        .select({ count: sql<number>`COUNT(DISTINCT ${users.id})` })
        .from(users)
        .innerJoin(clickLogs, eq(clickLogs.userId, users.id))
        .where(and(...baseConditions));
    };

    const [countResult] = await buildCountQuery();

    return {
      users: rankingQuery.map(row => ({
        id: row.userId,
        email: row.email ?? '',
        planName: row.planName,
        totalClicks: Number(row.totalClicks),
        clicksToday: Number(row.clicksToday),
      })),
      total: Number(countResult?.count || 0),
    };
  }
}

export const storage = new DatabaseStorage();
