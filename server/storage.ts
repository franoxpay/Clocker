import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  plans,
  domains,
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

  getOffer(id: number): Promise<Offer | undefined>;
  getOfferBySlug(slug: string): Promise<Offer | undefined>;
  getOfferBySlugAndDomain(slug: string, domainId: number | null): Promise<Offer | undefined>;
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

  async getOffersByUserId(userId: string): Promise<Offer[]> {
    return db
      .select({
        offer: offers,
        domain: domains,
      })
      .from(offers)
      .leftJoin(domains, eq(offers.domainId, domains.id))
      .where(eq(offers.userId, userId))
      .orderBy(desc(offers.createdAt))
      .then((rows) =>
        rows.map((row) => ({
          ...row.offer,
          domain: row.domain,
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
    filters?: { offerId?: number; domainId?: number; redirectType?: string; platform?: string }
  ): Promise<{ logs: ClickLog[]; total: number }> {
    const offset = (page - 1) * limit;
    const conditions = [eq(clickLogs.userId, userId)];

    if (filters?.offerId) {
      conditions.push(eq(clickLogs.offerId, filters.offerId));
    }
    if (filters?.redirectType) {
      conditions.push(eq(clickLogs.redirectedTo, filters.redirectType));
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
}

export const storage = new DatabaseStorage();
