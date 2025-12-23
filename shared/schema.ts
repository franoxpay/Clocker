import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: text("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  language: varchar("language").default("pt-BR").notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  planId: integer("plan_id"),
  subscriptionStatus: varchar("subscription_status").default("inactive"),
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  clicksUsedThisMonth: integer("clicks_used_this_month").default(0).notNull(),
  clicksResetDate: timestamp("clicks_reset_date"),
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: varchar("suspension_reason"),
  gracePeriodEndsAt: timestamp("grace_period_ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Plans table
export const plans = pgTable("plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name").notNull(),
  nameEn: varchar("name_en").notNull(),
  price: integer("price").notNull(),
  maxOffers: integer("max_offers").notNull(),
  maxDomains: integer("max_domains").notNull(),
  maxClicks: integer("max_clicks").notNull(),
  hasTrial: boolean("has_trial").default(false).notNull(),
  trialDays: integer("trial_days").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isUnlimited: boolean("is_unlimited").default(false).notNull(),
  stripePriceId: varchar("stripe_price_id"),
  stripeProductId: varchar("stripe_product_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Domains table
export const domains = pgTable(
  "domains",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    subdomain: varchar("subdomain").notNull(),
    easypanelDomainId: varchar("easypanel_domain_id"),
    isActive: boolean("is_active").default(true).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    lastCheckedAt: timestamp("last_checked_at"),
    lastVerificationError: text("last_verification_error"),
    sslStatus: varchar("ssl_status").default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("domains_subdomain_idx").on(table.subdomain),
  ]
);

// Shared domains table (admin-managed domains available to all users)
export const sharedDomains = pgTable(
  "shared_domains",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    subdomain: varchar("subdomain").notNull(),
    easypanelDomainId: varchar("easypanel_domain_id"),
    isActive: boolean("is_active").default(true).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    lastCheckedAt: timestamp("last_checked_at"),
    lastVerificationError: text("last_verification_error"),
    sslStatus: varchar("ssl_status").default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("shared_domains_subdomain_idx").on(table.subdomain),
  ]
);

// Offers table
export const offers = pgTable(
  "offers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    domainId: integer("domain_id").references(() => domains.id, { onDelete: "cascade" }),
    sharedDomainId: integer("shared_domain_id").references(() => sharedDomains.id, { onDelete: "set null" }),
    name: varchar("name").notNull(),
    slug: varchar("slug").notNull(),
    xcode: varchar("xcode").notNull(),
    platform: varchar("platform").notNull(),
    blackPageUrl: text("black_page_url").notNull(),
    whitePageUrl: text("white_page_url").notNull(),
    allowedCountries: text("allowed_countries").array().default(sql`ARRAY['BR']`).notNull(),
    allowedDevices: text("allowed_devices").array().default(sql`ARRAY['smartphone']`).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    totalClicks: integer("total_clicks").default(0).notNull(),
    blackClicks: integer("black_clicks").default(0).notNull(),
    whiteClicks: integer("white_clicks").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("offers_domain_slug_idx").on(table.domainId, table.slug),
  ]
);

// Click logs table
export const clickLogs = pgTable(
  "click_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    offerId: integer("offer_id").notNull().references(() => offers.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ipAddress: varchar("ip_address"),
    userAgent: text("user_agent"),
    country: varchar("country"),
    device: varchar("device"),
    redirectedTo: varchar("redirected_to").notNull(),
    allParams: jsonb("all_params"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("click_logs_offer_id_idx").on(table.offerId),
    index("click_logs_user_id_idx").on(table.userId),
    index("click_logs_created_at_idx").on(table.createdAt),
  ]
);

// Daily click metrics table (for historical data beyond 7 days)
export const dailyClickMetrics = pgTable(
  "daily_click_metrics",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "set null" }),
    date: timestamp("date").notNull(),
    totalClicks: integer("total_clicks").default(0).notNull(),
    blackClicks: integer("black_clicks").default(0).notNull(),
    whiteClicks: integer("white_clicks").default(0).notNull(),
  },
  (table) => [
    index("daily_metrics_user_date_idx").on(table.userId, table.date),
  ]
);

// Notifications table
export const notifications = pgTable(
  "notifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type").notNull(),
    titlePt: text("title_pt").notNull(),
    titleEn: text("title_en").notNull(),
    messagePt: text("message_pt").notNull(),
    messageEn: text("message_en").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
  ]
);

// Admin settings table
export const adminSettings = pgTable("admin_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  logoPath: text("logo_path"),
  logoWidth: integer("logo_width"),
  logoHeight: integer("logo_height"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Admin impersonation sessions
export const adminImpersonations = pgTable("admin_impersonations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  adminId: varchar("admin_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUserId: varchar("target_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionToken: varchar("session_token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  plan: one(plans, {
    fields: [users.planId],
    references: [plans.id],
  }),
  domains: many(domains),
  offers: many(offers),
  clickLogs: many(clickLogs),
  notifications: many(notifications),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  users: many(users),
}));

export const domainsRelations = relations(domains, ({ one, many }) => ({
  user: one(users, {
    fields: [domains.userId],
    references: [users.id],
  }),
  offers: many(offers),
}));

export const offersRelations = relations(offers, ({ one, many }) => ({
  user: one(users, {
    fields: [offers.userId],
    references: [users.id],
  }),
  domain: one(domains, {
    fields: [offers.domainId],
    references: [domains.id],
  }),
  sharedDomain: one(sharedDomains, {
    fields: [offers.sharedDomainId],
    references: [sharedDomains.id],
  }),
  clickLogs: many(clickLogs),
}));

export const sharedDomainsRelations = relations(sharedDomains, ({ many }) => ({
  offers: many(offers),
}));

export const clickLogsRelations = relations(clickLogs, ({ one }) => ({
  offer: one(offers, {
    fields: [clickLogs.offerId],
    references: [offers.id],
  }),
  user: one(users, {
    fields: [clickLogs.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDomainSchema = createInsertSchema(domains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSharedDomainSchema = createInsertSchema(sharedDomains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOfferSchema = createInsertSchema(offers).omit({
  id: true,
  xcode: true,
  totalClicks: true,
  blackClicks: true,
  whiteClicks: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClickLogSchema = createInsertSchema(clickLogs).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;

export type Domain = typeof domains.$inferSelect;
export type InsertDomain = z.infer<typeof insertDomainSchema>;

export type SharedDomain = typeof sharedDomains.$inferSelect;
export type InsertSharedDomain = z.infer<typeof insertSharedDomainSchema>;

export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;

export type ClickLog = typeof clickLogs.$inferSelect;
export type InsertClickLog = z.infer<typeof insertClickLogSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type DailyClickMetric = typeof dailyClickMetrics.$inferSelect;
export type AdminSettings = typeof adminSettings.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type AdminImpersonation = typeof adminImpersonations.$inferSelect;
