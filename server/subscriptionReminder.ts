import { db } from "./db";
import { users, plans } from "@shared/schema";
import { eq, and, isNotNull, inArray, or, isNull } from "drizzle-orm";
import {
  sendSubscriptionExpiring3DaysEmail,
  sendSubscriptionExpiredTodayEmail,
  sendSubscriptionExpired2DaysEmail,
  sendSubscriptionExpired7DaysEmail,
} from "./email";

const REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000; // run every 6 hours

let isRunning = false;

function daysDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function checkSubscriptionReminders() {
  if (isRunning) {
    console.log("[SUBSCRIPTION REMINDER] Previous check still running, skipping...");
    return;
  }

  isRunning = true;
  console.log("[SUBSCRIPTION REMINDER] Running subscription reminder check...");

  try {
    const now = new Date();

    const candidates = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        subscriptionStatus: users.subscriptionStatus,
        subscriptionEndDate: users.subscriptionEndDate,
        planId: users.planId,
        reminderSent3DaysBefore: users.reminderSent3DaysBefore,
        reminderSentOnExpiry: users.reminderSentOnExpiry,
        reminderSent2DaysAfter: users.reminderSent2DaysAfter,
        reminderSent7DaysAfter: users.reminderSent7DaysAfter,
      })
      .from(users)
      .where(isNotNull(users.subscriptionEndDate));

    const planCache: Record<number, string> = {};

    async function getPlanName(planId: number | null): Promise<string> {
      if (!planId) return "seu plano";
      if (planCache[planId]) return planCache[planId];
      const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, planId));
      planCache[planId] = plan?.name ?? "seu plano";
      return planCache[planId];
    }

    for (const user of candidates) {
      if (!user.subscriptionEndDate || !user.email) continue;

      const endDate = new Date(user.subscriptionEndDate);
      const daysUntilExpiry = daysDiff(now, endDate);
      const daysSinceExpiry = daysDiff(endDate, now);
      const firstName = user.firstName || "Cliente";
      const isActive = ["active", "trialing"].includes(user.subscriptionStatus ?? "");

      try {
        if (isActive && daysUntilExpiry === 3 && !user.reminderSent3DaysBefore) {
          const planName = await getPlanName(user.planId);
          console.log(`[SUBSCRIPTION REMINDER] Sending 3-day warning to ${user.email}`);
          await sendSubscriptionExpiring3DaysEmail(user.email, firstName, planName, formatDate(endDate), user.id);
          await db.update(users).set({ reminderSent3DaysBefore: now }).where(eq(users.id, user.id));
        }

        if (!isActive && daysSinceExpiry === 0 && !user.reminderSentOnExpiry) {
          const planName = await getPlanName(user.planId);
          console.log(`[SUBSCRIPTION REMINDER] Sending expiry-day email to ${user.email}`);
          await sendSubscriptionExpiredTodayEmail(user.email, firstName, planName, user.id);
          await db.update(users).set({ reminderSentOnExpiry: now }).where(eq(users.id, user.id));
        }

        if (!isActive && daysSinceExpiry === 2 && !user.reminderSent2DaysAfter) {
          const planName = await getPlanName(user.planId);
          console.log(`[SUBSCRIPTION REMINDER] Sending 2-days-after email to ${user.email}`);
          await sendSubscriptionExpired2DaysEmail(user.email, firstName, planName, user.id);
          await db.update(users).set({ reminderSent2DaysAfter: now }).where(eq(users.id, user.id));
        }

        if (!isActive && daysSinceExpiry === 7 && !user.reminderSent7DaysAfter) {
          const planName = await getPlanName(user.planId);
          console.log(`[SUBSCRIPTION REMINDER] Sending 7-days-after email to ${user.email}`);
          await sendSubscriptionExpired7DaysEmail(user.email, firstName, planName, user.id);
          await db.update(users).set({ reminderSent7DaysAfter: now }).where(eq(users.id, user.id));
        }
      } catch (err) {
        console.error(`[SUBSCRIPTION REMINDER] Error processing user ${user.email}:`, err);
      }
    }

    console.log(`[SUBSCRIPTION REMINDER] Check complete. Processed ${candidates.length} users.`);
  } catch (err) {
    console.error("[SUBSCRIPTION REMINDER] Fatal error during check:", err);
  } finally {
    isRunning = false;
  }
}

export function startSubscriptionReminder() {
  console.log("[SUBSCRIPTION REMINDER] Starting subscription reminder service...");
  checkSubscriptionReminders();
  setInterval(checkSubscriptionReminders, REMINDER_INTERVAL_MS);
}
