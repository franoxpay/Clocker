import { eq, and, desc, sql, gte, lte, isNull, inArray } from "drizzle-orm";
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
  suspensionHistory,
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
  type SuspensionHistory,
  type InsertSuspensionHistory,
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
  getUserUsage(userId: string): Promise<{
    offers: { used: number; limit: number | null };
    domains: { used: number; limit: number | null };
    clicks: { used: number; limit: number | null };
  }>;

  getPlan(id: number): Promise<Plan | undefined>;
  getPlanByStripePriceId(priceId: string): Promise<Plan | undefined>;
  getAllPlans(): Promise<Plan[]>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<InsertPlan>): Promise<Plan | undefined>;
  deletePlan(id: number): Promise<void>;

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

  getClicksBreakdownByUserIds(userIds: string[]): Promise<Map<string, {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lifetime: number;
  }>>;

  getBillingMetrics(): Promise<{
    subscriptionsActive: number;
    subscriptionsInactive: number;
    subscriptionsTrial: number;
    subscriptionsSuspended: number;
    usersToday: number;
    usersThisMonth: number;
    mrr: number;
    totalRevenue: number;
  }>;

  getSubscribersWithPagination(
    page: number,
    limit: number,
    filters?: { planId?: number; status?: string; startDate?: Date; endDate?: Date }
  ): Promise<{
    subscribers: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      planId: number | null;
      planName: string | null;
      subscriptionStatus: string;
      subscriptionStartDate: Date | null;
      subscriptionEndDate: Date | null;
      stripeCustomerId: string | null;
    }>;
    total: number;
  }>;

  // Plan limits and suspension management
  getUserOffersCount(userId: string): Promise<number>;
  getUserDomainsCount(userId: string): Promise<number>;
  getMonthlyClicksForUser(userId: string): Promise<number>;
  
  incrementUserMonthlyClicks(userId: string): Promise<{
    clicksUsed: number;
    clicksLimit: number | null;
    isOverLimit: boolean;
    gracePeriodEndsAt: Date | null;
    isSuspended: boolean;
  }>;

  startGracePeriod(userId: string): Promise<void>;
  suspendUser(userId: string, reason: string): Promise<void>;
  unsuspendUser(userId: string, actorId?: string): Promise<void>;
  resetUserMonthlyClicks(userId: string): Promise<void>;
  
  // Suspension history
  createSuspensionHistoryEntry(entry: InsertSuspensionHistory): Promise<SuspensionHistory>;
  getSuspensionHistory(userId: string, limit?: number): Promise<SuspensionHistory[]>;
  getAllSuspensionHistory(page: number, limit: number): Promise<{ entries: SuspensionHistory[]; total: number }>;

  // Check if user can create offer/domain
  canUserCreateOffer(userId: string): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number | null }>;
  canUserCreateDomain(userId: string): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number | null }>;
  canUserDowngradeToPlan(userId: string, newPlanId: number): Promise<{ allowed: boolean; reason?: string; offersExcess?: number; domainsExcess?: number }>;
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

  async getUserUsage(userId: string): Promise<{
    offers: { used: number; limit: number | null };
    domains: { used: number; limit: number | null };
    clicks: { used: number; limit: number | null };
  }> {
    const user = await this.getUser(userId);
    if (!user) {
      return {
        offers: { used: 0, limit: null },
        domains: { used: 0, limit: null },
        clicks: { used: 0, limit: null },
      };
    }

    const plan = user.planId ? await this.getPlan(user.planId) : null;

    const [offersCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(offers)
      .where(eq(offers.userId, userId));

    const [domainsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(domains)
      .where(eq(domains.userId, userId));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [clicksCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clickLogs)
      .where(
        and(
          eq(clickLogs.userId, userId),
          gte(clickLogs.createdAt, startOfMonth)
        )
      );

    return {
      offers: {
        used: offersCount?.count || 0,
        limit: plan?.maxOffers ?? null,
      },
      domains: {
        used: domainsCount?.count || 0,
        limit: plan?.maxDomains ?? null,
      },
      clicks: {
        used: clicksCount?.count || 0,
        limit: plan?.maxClicks ?? null,
      },
    };
  }

  async getPlan(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return plan;
  }

  async getPlanByStripePriceId(priceId: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.stripePriceId, priceId)).limit(1);
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

  async deletePlan(id: number): Promise<void> {
    await db.delete(plans).where(eq(plans.id, id));
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
    
    // Increment monthly clicks counter for the user
    // Only count "black" redirects as they represent real advertiser traffic
    if (log.userId && log.redirectedTo === 'black') {
      await this.incrementUserMonthlyClicks(log.userId);
    }
    
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

  async getUserClickStats(userId: string): Promise<{ totalClicks: number; blackClicks: number; whiteClicks: number }> {
    const result = await db
      .select({
        totalClicks: sql<number>`COUNT(*)`,
        blackClicks: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'black' THEN 1 ELSE 0 END)`,
        whiteClicks: sql<number>`SUM(CASE WHEN ${clickLogs.redirectedTo} = 'white' THEN 1 ELSE 0 END)`,
      })
      .from(clickLogs)
      .where(eq(clickLogs.userId, userId));

    return {
      totalClicks: Number(result[0]?.totalClicks || 0),
      blackClicks: Number(result[0]?.blackClicks || 0),
      whiteClicks: Number(result[0]?.whiteClicks || 0),
    };
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

  async getClicksBreakdownByUserIds(userIds: string[]): Promise<Map<string, {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lifetime: number;
  }>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await db
      .select({
        userId: clickLogs.userId,
        today: sql<number>`SUM(CASE WHEN ${clickLogs.createdAt} >= ${today} THEN 1 ELSE 0 END)`,
        thisWeek: sql<number>`SUM(CASE WHEN ${clickLogs.createdAt} >= ${weekStart} THEN 1 ELSE 0 END)`,
        thisMonth: sql<number>`SUM(CASE WHEN ${clickLogs.createdAt} >= ${monthStart} THEN 1 ELSE 0 END)`,
        lifetime: sql<number>`COUNT(*)`,
      })
      .from(clickLogs)
      .where(inArray(clickLogs.userId, userIds))
      .groupBy(clickLogs.userId);

    const map = new Map<string, { today: number; thisWeek: number; thisMonth: number; lifetime: number }>();
    
    for (const userId of userIds) {
      map.set(userId, { today: 0, thisWeek: 0, thisMonth: 0, lifetime: 0 });
    }
    
    for (const row of result) {
      map.set(row.userId, {
        today: Number(row.today),
        thisWeek: Number(row.thisWeek),
        thisMonth: Number(row.thisMonth),
        lifetime: Number(row.lifetime),
      });
    }

    return map;
  }

  async getBillingMetrics(): Promise<{
    subscriptionsActive: number;
    subscriptionsInactive: number;
    subscriptionsTrial: number;
    subscriptionsSuspended: number;
    usersToday: number;
    usersThisMonth: number;
    mrr: number;
    totalRevenue: number;
  }> {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [stats] = await db
      .select({
        active: sql<number>`SUM(CASE WHEN ${users.subscriptionStatus} = 'active' THEN 1 ELSE 0 END)`,
        inactive: sql<number>`SUM(CASE WHEN ${users.subscriptionStatus} = 'inactive' OR ${users.subscriptionStatus} IS NULL THEN 1 ELSE 0 END)`,
        trial: sql<number>`SUM(CASE WHEN ${users.trialEndsAt} IS NOT NULL AND ${users.trialEndsAt} > NOW() THEN 1 ELSE 0 END)`,
        suspended: sql<number>`SUM(CASE WHEN ${users.suspendedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
        usersToday: sql<number>`SUM(CASE WHEN ${users.createdAt} >= ${today} THEN 1 ELSE 0 END)`,
        usersThisMonth: sql<number>`SUM(CASE WHEN ${users.createdAt} >= ${monthStart} THEN 1 ELSE 0 END)`,
      })
      .from(users);

    const mrrResult = await db
      .select({
        mrr: sql<number>`COALESCE(SUM(${plans.price}), 0)`,
      })
      .from(users)
      .innerJoin(plans, eq(users.planId, plans.id))
      .where(eq(users.subscriptionStatus, 'active'));

    return {
      subscriptionsActive: Number(stats?.active || 0),
      subscriptionsInactive: Number(stats?.inactive || 0),
      subscriptionsTrial: Number(stats?.trial || 0),
      subscriptionsSuspended: Number(stats?.suspended || 0),
      usersToday: Number(stats?.usersToday || 0),
      usersThisMonth: Number(stats?.usersThisMonth || 0),
      mrr: Number(mrrResult[0]?.mrr || 0),
      totalRevenue: 0,
    };
  }

  async getSubscribersWithPagination(
    page: number,
    limit: number,
    filters?: { planId?: number; status?: string; startDate?: Date; endDate?: Date }
  ): Promise<{
    subscribers: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      planId: number | null;
      planName: string | null;
      subscriptionStatus: string;
      subscriptionStartDate: Date | null;
      subscriptionEndDate: Date | null;
      stripeCustomerId: string | null;
    }>;
    total: number;
  }> {
    const offset = (page - 1) * limit;
    const conditions: any[] = [];

    if (filters?.planId) {
      conditions.push(eq(users.planId, filters.planId));
    }
    if (filters?.status) {
      if (filters.status === 'suspended') {
        conditions.push(sql`${users.suspendedAt} IS NOT NULL`);
      } else if (filters.status === 'trial') {
        conditions.push(sql`${users.trialEndsAt} IS NOT NULL AND ${users.trialEndsAt} > NOW()`);
      } else {
        conditions.push(eq(users.subscriptionStatus, filters.status));
      }
    }
    if (filters?.startDate) {
      conditions.push(gte(users.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(users.createdAt, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        planId: users.planId,
        planName: plans.name,
        subscriptionStatus: users.subscriptionStatus,
        subscriptionStartDate: users.subscriptionStartDate,
        subscriptionEndDate: users.subscriptionEndDate,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .leftJoin(plans, eq(users.planId, plans.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users);
    
    const [countResult] = whereClause 
      ? await countQuery.where(whereClause)
      : await countQuery;

    return {
      subscribers: result.map(row => ({
        id: row.id,
        email: row.email ?? '',
        firstName: row.firstName,
        lastName: row.lastName,
        planId: row.planId,
        planName: row.planName,
        subscriptionStatus: row.subscriptionStatus ?? 'inactive',
        subscriptionStartDate: row.subscriptionStartDate,
        subscriptionEndDate: row.subscriptionEndDate,
        stripeCustomerId: row.stripeCustomerId,
      })),
      total: Number(countResult?.count || 0),
    };
  }

  // ==========================================
  // PLAN LIMITS AND SUSPENSION MANAGEMENT
  // ==========================================

  async getUserOffersCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(offers)
      .where(eq(offers.userId, userId));
    return result?.count || 0;
  }

  async getUserDomainsCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(domains)
      .where(eq(domains.userId, userId));
    return result?.count || 0;
  }

  async getMonthlyClicksForUser(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.clicksUsedThisMonth || 0;
  }

  async incrementUserMonthlyClicks(userId: string): Promise<{
    clicksUsed: number;
    clicksLimit: number | null;
    isOverLimit: boolean;
    gracePeriodEndsAt: Date | null;
    isSuspended: boolean;
  }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { clicksUsed: 0, clicksLimit: null, isOverLimit: false, gracePeriodEndsAt: null, isSuspended: false };
    }

    const plan = user.planId ? await this.getPlan(user.planId) : null;
    const now = new Date();

    // Check if we need to reset the monthly clicks
    // Reset happens on the subscription anniversary date
    let clicksUsed = user.clicksUsedThisMonth || 0;
    let shouldReset = false;

    if (user.clicksResetDate) {
      if (now >= user.clicksResetDate) {
        shouldReset = true;
        clicksUsed = 0;
      }
    } else if (user.subscriptionStartDate) {
      // Initialize clicksResetDate based on subscription start date
      const resetDate = new Date(user.subscriptionStartDate);
      resetDate.setMonth(resetDate.getMonth() + 1);
      if (now >= resetDate) {
        shouldReset = true;
        clicksUsed = 0;
      }
    }

    // Increment clicks
    clicksUsed += 1;

    // Determine the next reset date
    let nextResetDate = user.clicksResetDate;
    if (shouldReset && user.subscriptionStartDate) {
      const subStart = new Date(user.subscriptionStartDate);
      const today = new Date();
      // Find the next anniversary
      let nextReset = new Date(subStart);
      while (nextReset <= today) {
        nextReset.setMonth(nextReset.getMonth() + 1);
      }
      nextResetDate = nextReset;
    } else if (!nextResetDate && user.subscriptionStartDate) {
      const subStart = new Date(user.subscriptionStartDate);
      nextResetDate = new Date(subStart);
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);
    }

    // Update user
    const updateData: any = {
      clicksUsedThisMonth: clicksUsed,
    };
    if (nextResetDate) {
      updateData.clicksResetDate = nextResetDate;
    }

    await this.updateUser(userId, updateData);

    const clicksLimit = plan?.isUnlimited ? null : (plan?.maxClicks ?? null);
    const isOverLimit = clicksLimit !== null && clicksUsed > clicksLimit;
    const isSuspended = user.suspendedAt !== null;

    return {
      clicksUsed,
      clicksLimit,
      isOverLimit,
      gracePeriodEndsAt: user.gracePeriodEndsAt,
      isSuspended,
    };
  }

  async startGracePeriod(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setHours(gracePeriodEndsAt.getHours() + 48);

    await this.updateUser(userId, { gracePeriodEndsAt });

    // Log the event
    await this.createSuspensionHistoryEntry({
      userId,
      event: 'grace_started',
      reason: 'clicks_exceeded',
      details: `Monthly click limit exceeded. Grace period until ${gracePeriodEndsAt.toISOString()}`,
      actorType: 'system',
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });
  }

  async suspendUser(userId: string, reason: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    const now = new Date();
    await this.updateUser(userId, {
      suspendedAt: now,
      suspensionReason: reason,
      gracePeriodEndsAt: null,
    });

    // Log the event
    await this.createSuspensionHistoryEntry({
      userId,
      event: 'suspended',
      reason,
      details: `User suspended: ${reason}`,
      actorType: 'system',
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });
  }

  async unsuspendUser(userId: string, actorId?: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    await this.updateUser(userId, {
      suspendedAt: null,
      suspensionReason: null,
      gracePeriodEndsAt: null,
    });

    // Log the event
    await this.createSuspensionHistoryEntry({
      userId,
      event: actorId ? 'admin_override' : 'unsuspended',
      reason: 'plan_upgrade',
      details: actorId ? `Admin override by ${actorId}` : 'Automatic unsuspension due to plan upgrade',
      actorId: actorId || null,
      actorType: actorId ? 'admin' : 'system',
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });
  }

  async resetUserMonthlyClicks(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user || !user.subscriptionStartDate) return;

    // Calculate next reset date based on subscription anniversary
    const subStart = new Date(user.subscriptionStartDate);
    const today = new Date();
    let nextReset = new Date(subStart);
    while (nextReset <= today) {
      nextReset.setMonth(nextReset.getMonth() + 1);
    }

    await this.updateUser(userId, {
      clicksUsedThisMonth: 0,
      clicksResetDate: nextReset,
    });
  }

  // ==========================================
  // SUSPENSION HISTORY
  // ==========================================

  async createSuspensionHistoryEntry(entry: InsertSuspensionHistory): Promise<SuspensionHistory> {
    const [created] = await db.insert(suspensionHistory).values(entry).returning();
    return created;
  }

  async getSuspensionHistory(userId: string, limitCount: number = 50): Promise<SuspensionHistory[]> {
    return db
      .select()
      .from(suspensionHistory)
      .where(eq(suspensionHistory.userId, userId))
      .orderBy(desc(suspensionHistory.createdAt))
      .limit(limitCount);
  }

  async getAllSuspensionHistory(page: number, limitCount: number): Promise<{ entries: SuspensionHistory[]; total: number }> {
    const offset = (page - 1) * limitCount;

    const entries = await db
      .select()
      .from(suspensionHistory)
      .orderBy(desc(suspensionHistory.createdAt))
      .limit(limitCount)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(suspensionHistory);

    return {
      entries,
      total: Number(countResult?.count || 0),
    };
  }

  // ==========================================
  // LIMIT CHECKS
  // ==========================================

  async canUserCreateOffer(userId: string): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number | null }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { allowed: false, reason: 'user_not_found', currentCount: 0, limit: null };
    }

    // Check if user is suspended
    if (user.suspendedAt) {
      return { allowed: false, reason: 'user_suspended', currentCount: 0, limit: null };
    }

    const plan = user.planId ? await this.getPlan(user.planId) : null;
    if (!plan) {
      return { allowed: false, reason: 'no_active_plan', currentCount: 0, limit: null };
    }

    // Unlimited plan
    if (plan.isUnlimited) {
      const currentCount = await this.getUserOffersCount(userId);
      return { allowed: true, currentCount, limit: null };
    }

    const currentCount = await this.getUserOffersCount(userId);
    const limit = plan.maxOffers;

    if (currentCount >= limit) {
      return { allowed: false, reason: 'limit_reached', currentCount, limit };
    }

    return { allowed: true, currentCount, limit };
  }

  async canUserCreateDomain(userId: string): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number | null }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { allowed: false, reason: 'user_not_found', currentCount: 0, limit: null };
    }

    // Check if user is suspended
    if (user.suspendedAt) {
      return { allowed: false, reason: 'user_suspended', currentCount: 0, limit: null };
    }

    const plan = user.planId ? await this.getPlan(user.planId) : null;
    if (!plan) {
      return { allowed: false, reason: 'no_active_plan', currentCount: 0, limit: null };
    }

    // Unlimited plan
    if (plan.isUnlimited) {
      const currentCount = await this.getUserDomainsCount(userId);
      return { allowed: true, currentCount, limit: null };
    }

    const currentCount = await this.getUserDomainsCount(userId);
    const limit = plan.maxDomains;

    if (currentCount >= limit) {
      return { allowed: false, reason: 'limit_reached', currentCount, limit };
    }

    return { allowed: true, currentCount, limit };
  }

  async canUserDowngradeToPlan(userId: string, newPlanId: number): Promise<{ allowed: boolean; reason?: string; offersExcess?: number; domainsExcess?: number }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { allowed: false, reason: 'user_not_found' };
    }

    const newPlan = await this.getPlan(newPlanId);
    if (!newPlan) {
      return { allowed: false, reason: 'plan_not_found' };
    }

    // Unlimited plan allows everything
    if (newPlan.isUnlimited) {
      return { allowed: true };
    }

    const offersCount = await this.getUserOffersCount(userId);
    const domainsCount = await this.getUserDomainsCount(userId);

    const offersExcess = Math.max(0, offersCount - newPlan.maxOffers);
    const domainsExcess = Math.max(0, domainsCount - newPlan.maxDomains);

    if (offersExcess > 0 || domainsExcess > 0) {
      return {
        allowed: false,
        reason: 'usage_exceeds_limits',
        offersExcess,
        domainsExcess,
      };
    }

    return { allowed: true };
  }
}

export const storage = new DatabaseStorage();
