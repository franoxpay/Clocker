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
  hasUsedCoupon: boolean("has_used_coupon").default(false).notNull(),
  usedCouponId: integer("used_coupon_id"),
  offersDeactivatedBySystem: boolean("offers_deactivated_by_system").default(false).notNull(),
  reminderSent3DaysBefore: timestamp("reminder_sent_3_days_before"),
  reminderSentOnExpiry: timestamp("reminder_sent_on_expiry"),
  reminderSent2DaysAfter: timestamp("reminder_sent_2_days_after"),
  reminderSent7DaysAfter: timestamp("reminder_sent_7_days_after"),
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
  isPopular: boolean("is_popular").default(false).notNull(),
  isFree: boolean("is_free").default(false).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
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
    lastInactiveNotificationAt: timestamp("last_inactive_notification_at"),
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
    lastInactiveNotificationAt: timestamp("last_inactive_notification_at"),
    sslStatus: varchar("ssl_status").default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("shared_domains_subdomain_idx").on(table.subdomain),
  ]
);

// User shared domains activation table (tracks which shared domains a user has activated)
export const userSharedDomains = pgTable(
  "user_shared_domains",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sharedDomainId: integer("shared_domain_id").notNull().references(() => sharedDomains.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_shared_domains_user_domain_idx").on(table.userId, table.sharedDomainId),
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
    blackPages: jsonb("black_pages").$type<Array<{ url: string; percentage: number }>>(),
    whitePageUrl: text("white_page_url").notNull(),
    allowedCountries: text("allowed_countries").array().default(sql`ARRAY['BR']`).notNull(),
    allowedDevices: text("allowed_devices").array().default(sql`ARRAY['smartphone']`).notNull(),
    extraParams: varchar("extra_params").default("").notNull(),
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
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "set null" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ipAddress: varchar("ip_address"),
    userAgent: text("user_agent"),
    country: varchar("country"),
    device: varchar("device"),
    redirectedTo: varchar("redirected_to").notNull(),
    allParams: jsonb("all_params"),
    requestUrl: text("request_url"),
    responseTimeMs: integer("response_time_ms"),
    hasError: boolean("has_error").default(false),
    errorMessage: text("error_message"),
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
  supportWhatsapp: text("support_whatsapp"),
  tiktokFilterEnabled: boolean("tiktok_filter_enabled").default(true).notNull(),
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

// Suspension history table - tracks all suspension/unsuspension events
export const suspensionHistory = pgTable(
  "suspension_history",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    event: varchar("event").notNull(), // 'suspended' | 'unsuspended' | 'grace_started' | 'admin_override'
    reason: text("reason"), // e.g., 'clicks_exceeded', 'grace_period_expired', 'payment_failed'
    details: text("details"), // Additional context
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }), // Admin who performed action (null for system)
    actorType: varchar("actor_type").notNull().default("system"), // 'system' | 'admin' | 'user'
    clicksAtEvent: integer("clicks_at_event"), // Clicks count at time of event
    planIdAtEvent: integer("plan_id_at_event"), // Plan at time of event
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("suspension_history_user_idx").on(table.userId),
    index("suspension_history_created_idx").on(table.createdAt),
  ]
);

// Removed domains history table - tracks domains removed by admin
export const removedDomains = pgTable(
  "removed_domains",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    subdomain: varchar("subdomain").notNull(),
    domainType: varchar("domain_type").notNull(), // 'user' | 'shared'
    originalOwnerId: varchar("original_owner_id").references(() => users.id, { onDelete: "set null" }), // null for shared domains
    originalOwnerEmail: varchar("original_owner_email"), // stored for reference even if user deleted
    offersAffectedCount: integer("offers_affected_count").default(0).notNull(),
    removedBy: varchar("removed_by").notNull().references(() => users.id, { onDelete: "set null" }),
    removalReason: text("removal_reason").default("phishing").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("removed_domains_subdomain_idx").on(table.subdomain),
    index("removed_domains_created_idx").on(table.createdAt),
  ]
);

// Coupons table - Cupons de desconto
export const coupons = pgTable(
  "coupons",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    code: varchar("code").notNull().unique(),
    discountType: varchar("discount_type").notNull(), // 'percentage' | 'fixed'
    discountValue: integer("discount_value").notNull(), // valor em centavos ou porcentagem
    durationMonths: integer("duration_months").default(1).notNull(), // quantos meses o desconto vale
    expiresAt: timestamp("expires_at"),
    validPlanIds: integer("valid_plan_ids").array(), // null = todos os planos
    affiliateUserId: varchar("affiliate_user_id").references(() => users.id, { onDelete: "set null" }),
    commissionType: varchar("commission_type"), // 'percentage' | 'fixed'
    commissionValue: integer("commission_value"), // valor em centavos ou porcentagem
    commissionDurationMonths: integer("commission_duration_months").default(1), // por quantos meses a comissão é paga (1, 3, 6, 12)
    usageCount: integer("usage_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("coupons_code_idx").on(table.code),
    index("coupons_affiliate_idx").on(table.affiliateUserId),
  ]
);

// Coupon usages table - Registro de uso de cupons
export const couponUsages = pgTable(
  "coupon_usages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    couponId: integer("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stripeSubscriptionId: varchar("stripe_subscription_id"),
    appliedAt: timestamp("applied_at").defaultNow().notNull(),
    status: varchar("status").default("active").notNull(), // 'active' | 'cancelled' | 'expired'
    discountAmountApplied: integer("discount_amount_applied"), // valor do desconto aplicado em centavos
    remainingMonths: integer("remaining_months").default(0).notNull(), // meses restantes de desconto
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("coupon_usages_coupon_idx").on(table.couponId),
    index("coupon_usages_user_idx").on(table.userId),
    uniqueIndex("coupon_usages_user_unique").on(table.userId), // cada usuário só pode usar 1 cupom
  ]
);

// Commissions table - Comissões de afiliados
export const commissions = pgTable(
  "commissions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    affiliateUserId: varchar("affiliate_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    referredUserId: varchar("referred_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    couponId: integer("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    couponUsageId: integer("coupon_usage_id").references(() => couponUsages.id, { onDelete: "set null" }),
    stripeSubscriptionId: varchar("stripe_subscription_id"),
    stripeInvoiceId: varchar("stripe_invoice_id"),
    amount: integer("amount").notNull(), // valor em centavos
    type: varchar("type").notNull(), // 'one_time' | 'recurring'
    status: varchar("status").default("pending").notNull(), // 'pending' | 'paid' | 'reversed'
    paidAt: timestamp("paid_at"),
    paidByAdminId: varchar("paid_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    reversedAt: timestamp("reversed_at"),
    reversedReason: varchar("reversed_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("commissions_affiliate_idx").on(table.affiliateUserId),
    index("commissions_referred_idx").on(table.referredUserId),
    index("commissions_status_idx").on(table.status),
    index("commissions_created_idx").on(table.createdAt),
  ]
);

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
  userActivations: many(userSharedDomains),
}));

export const userSharedDomainsRelations = relations(userSharedDomains, ({ one }) => ({
  user: one(users, {
    fields: [userSharedDomains.userId],
    references: [users.id],
  }),
  sharedDomain: one(sharedDomains, {
    fields: [userSharedDomains.sharedDomainId],
    references: [sharedDomains.id],
  }),
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

export const insertUserSharedDomainSchema = createInsertSchema(userSharedDomains).omit({
  id: true,
  createdAt: true,
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

// TikTok2 Telemetry table - captures behavioral data from bait page
export const tiktok2Telemetry = pgTable(
  "tiktok2_telemetry",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    token: varchar("token").notNull(),
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "cascade" }),
    ipAddress: varchar("ip_address"),
    userAgent: text("user_agent"),
    
    // Timing data (critical for bot detection)
    pageLoadTime: integer("page_load_time"),
    timeToFirstInteraction: integer("time_to_first_interaction"),
    timeToRedirect: integer("time_to_redirect"),
    totalTimeOnPage: integer("total_time_on_page"),
    
    // Touch/interaction events (should be ZERO for loading page)
    touchCount: integer("touch_count").default(0),
    clickCount: integer("click_count").default(0),
    scrollCount: integer("scroll_count").default(0),
    mouseMoveCount: integer("mouse_move_count").default(0),
    keyPressCount: integer("key_press_count").default(0),
    
    // Device/browser fingerprint
    screenWidth: integer("screen_width"),
    screenHeight: integer("screen_height"),
    viewportWidth: integer("viewport_width"),
    viewportHeight: integer("viewport_height"),
    devicePixelRatio: varchar("device_pixel_ratio"),
    colorDepth: integer("color_depth"),
    timezone: varchar("timezone"),
    language: varchar("language"),
    languages: text("languages"),
    platform: varchar("platform"),
    hardwareConcurrency: integer("hardware_concurrency"),
    deviceMemory: varchar("device_memory"),
    maxTouchPoints: integer("max_touch_points"),
    
    // WebView/Bot indicators
    hasWebdriver: boolean("has_webdriver").default(false),
    hasAutomation: boolean("has_automation").default(false),
    hasFakeChrome: boolean("has_fake_chrome").default(false),
    hasNoLanguages: boolean("has_no_languages").default(false),
    
    // Navigation/performance data
    connectionType: varchar("connection_type"),
    domContentLoaded: integer("dom_content_loaded"),
    loadEventEnd: integer("load_event_end"),
    
    // Visibility/focus tracking
    visibilityChanges: integer("visibility_changes").default(0),
    focusChanges: integer("focus_changes").default(0),
    wasHidden: boolean("was_hidden").default(false),
    
    // Honeypot interactions (should be ZERO)
    honeypotTriggered: boolean("honeypot_triggered").default(false),
    trapLinkClicked: boolean("trap_link_clicked").default(false),
    
    // Raw event log (detailed timeline)
    eventLog: jsonb("event_log"),
    
    // Outcome
    redirectedTo: varchar("redirected_to"),
    isBotDetected: boolean("is_bot_detected").default(false),
    botReason: varchar("bot_reason"),
    
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tiktok2_telemetry_token_idx").on(table.token),
    index("tiktok2_telemetry_offer_idx").on(table.offerId),
    index("tiktok2_telemetry_created_idx").on(table.createdAt),
  ]
);

export const insertTiktok2TelemetrySchema = createInsertSchema(tiktok2Telemetry).omit({
  id: true,
  createdAt: true,
});

// Email logs table - tracks all sent emails
export const emailLogs = pgTable(
  "email_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    toEmail: varchar("to_email").notNull(),
    subject: varchar("subject").notNull(),
    type: varchar("type").notNull(), // welcome, subscription, domain_inactive, plan_limit, notification
    status: varchar("status").default("sent").notNull(), // sent, failed
    resendId: varchar("resend_id"), // ID returned by Resend API
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"), // Additional context (plan name, domain name, etc.)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_logs_user_idx").on(table.userId),
    index("email_logs_type_idx").on(table.type),
    index("email_logs_created_idx").on(table.createdAt),
  ]
);

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

// Email templates table - editable email templates
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: varchar("type").notNull().unique(), // welcome, subscription, domain_inactive, etc.
    subjectPt: varchar("subject_pt").notNull(),
    subjectEn: varchar("subject_en").notNull(),
    htmlPt: text("html_pt").notNull(),
    htmlEn: text("html_en").notNull(),
    description: varchar("description"), // Admin description of what this template is for
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  updatedAt: true,
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

export type Tiktok2Telemetry = typeof tiktok2Telemetry.$inferSelect;
export type InsertTiktok2Telemetry = z.infer<typeof insertTiktok2TelemetrySchema>;

export const insertSuspensionHistorySchema = createInsertSchema(suspensionHistory).omit({
  id: true,
  createdAt: true,
});
export type SuspensionHistory = typeof suspensionHistory.$inferSelect;
export type InsertSuspensionHistory = z.infer<typeof insertSuspensionHistorySchema>;

export const insertRemovedDomainSchema = createInsertSchema(removedDomains).omit({
  id: true,
  createdAt: true,
});
export type RemovedDomain = typeof removedDomains.$inferSelect;
export type InsertRemovedDomain = z.infer<typeof insertRemovedDomainSchema>;

export type UserSharedDomain = typeof userSharedDomains.$inferSelect;
export type InsertUserSharedDomain = z.infer<typeof insertUserSharedDomainSchema>;

// Coupon schemas and types
export const insertCouponSchema = createInsertSchema(coupons).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;

export const insertCouponUsageSchema = createInsertSchema(couponUsages).omit({
  id: true,
  appliedAt: true,
  createdAt: true,
});
export type CouponUsage = typeof couponUsages.$inferSelect;
export type InsertCouponUsage = z.infer<typeof insertCouponUsageSchema>;

export const insertCommissionSchema = createInsertSchema(commissions).omit({
  id: true,
  createdAt: true,
});
export type Commission = typeof commissions.$inferSelect;
export type InsertCommission = z.infer<typeof insertCommissionSchema>;

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
