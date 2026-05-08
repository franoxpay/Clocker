/**
 * limitEnforcer.ts
 *
 * Enforces monthly click limits with:
 *  - 20% tolerance zone (100%-120%): clicks proceed, no action
 *  - Above 120%: attempt auto-upgrade to next plan via Stripe
 *  - If upgrade fails or Stripe unavailable: start 72-hour grace period
 *  - After grace period expires: suspend account
 *  - Suspended users: all cloaker redirects go to /suspended page
 *  - Payment regularization: clears grace period + suspension automatically
 *
 * Plan upgrade order (by price ASC):
 *   Plano Básico → Plano Avançado → Plano Pré-Escala → Plano Escala → Plano Ilimitado
 *   Free does NOT participate. Ilimitado has no overage.
 */

import { storage } from "./storage";
import { getStripeClient, isStripeConfigured } from "./stripeClient";
import { sendPlanLimitEmail, sendAccountSuspendedEmail } from "./email";
import type { User, Plan } from "@shared/schema";

// 20% tolerance above plan limit before triggering upgrade/grace
const OVERAGE_THRESHOLD_FACTOR = 1.2;

// Grace period duration in hours (3 days)
const GRACE_PERIOD_HOURS = 72;

// Main app domain for redirecting suspended users
// MAIN_DOMAIN may be a comma-separated list (e.g. "clerion.app,easypanel.host") — always use only the first valid entry
function getPrimaryDomain(): string {
  const raw = process.env.MAIN_DOMAIN || "clerion.app";
  const first = raw.split(",").map(d => d.trim().toLowerCase()).filter(Boolean)[0];
  return first || "clerion.app";
}
export const SUSPENDED_PAGE_URL = `https://${getPrimaryDomain()}/suspended`;

// ============================================================
// STATUS COMPUTATION
// ============================================================

/**
 * Computes the user's current operational status.
 * Status values: 'active' | 'grace_period' | 'suspended' | 'canceled'
 *
 * Note: 'suspended' is returned for both explicitly suspended users
 * AND users whose grace period has expired (awaiting scheduler sweep).
 */
export function computeUserStatus(
  user: User
): "active" | "grace_period" | "suspended" | "canceled" {
  if (user.suspendedAt) return "suspended";

  if (user.gracePeriodEndsAt) {
    if (new Date() > user.gracePeriodEndsAt) {
      return "suspended"; // grace expired — scheduler will finalize suspension
    }
    return "grace_period";
  }

  const activeStatuses = ["active", "trialing"];
  if (!activeStatuses.includes(user.subscriptionStatus ?? "")) {
    return "canceled";
  }

  return "active";
}

// ============================================================
// AUTO-UPGRADE
// ============================================================

/**
 * Returns the next plan in the tier above the given plan.
 * Plans are sorted by price ASC; returns null if already at the top.
 * Free plans and plans without a valid ID are excluded.
 */
export async function getNextPlanForUser(
  currentPlanId: number
): Promise<Plan | null> {
  const allPlans = await storage.getActivePlans();

  // Sort paid active plans by price (ascending)
  const paidPlans = allPlans
    .filter((p) => !p.isFree && p.isActive)
    .sort((a, b) => a.price - b.price);

  const currentIndex = paidPlans.findIndex((p) => p.id === currentPlanId);
  if (currentIndex === -1 || currentIndex === paidPlans.length - 1) {
    return null; // Not found or already on highest plan
  }

  return paidPlans[currentIndex + 1];
}

/**
 * Attempts to auto-upgrade the user's Stripe subscription to the next plan.
 *
 * Outcomes:
 *   'upgraded'     — Stripe subscription updated + user planId updated
 *   'no_next_plan' — Already on top tier (Ilimitado) or plan not found
 *   'stripe_failed'— Stripe returned an error
 *   'no_stripe'    — Stripe not configured or missing IDs
 */
export async function attemptAutoUpgrade(
  userId: string
): Promise<"upgraded" | "no_next_plan" | "stripe_failed" | "no_stripe"> {
  const user = await storage.getUser(userId);
  if (!user?.planId) {
    console.log(`[LimitEnforcer] Cannot upgrade user ${userId} — no planId`);
    return "no_next_plan";
  }

  const currentPlan = await storage.getPlan(user.planId);
  if (!currentPlan || currentPlan.isFree || currentPlan.isUnlimited) {
    console.log(
      `[LimitEnforcer] Cannot upgrade user ${userId} — plan "${currentPlan?.name}" is free or unlimited`
    );
    return "no_next_plan";
  }

  const nextPlan = await getNextPlanForUser(user.planId);
  if (!nextPlan) {
    console.log(
      `[LimitEnforcer] No next plan available for user ${userId} (current: "${currentPlan.name}")`
    );
    return "no_next_plan";
  }

  console.log(
    `[LimitEnforcer] Auto-upgrade initiated: user=${userId}, "${currentPlan.name}" → "${nextPlan.name}"`
  );

  const stripeReady = await isStripeConfigured();
  if (!stripeReady || !user.stripeSubscriptionId || !nextPlan.stripePriceId) {
    console.log(
      `[LimitEnforcer] Stripe not ready for auto-upgrade — ` +
        `configured=${stripeReady}, subscriptionId=${!!user.stripeSubscriptionId}, ` +
        `nextPriceId=${!!nextPlan.stripePriceId}`
    );
    return "no_stripe";
  }

  try {
    const stripe = await getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(
      user.stripeSubscriptionId
    );
    const currentItem = subscription.items.data[0];
    if (!currentItem) throw new Error("Subscription has no items");

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: currentItem.id, price: nextPlan.stripePriceId }],
      proration_behavior: "always_invoice",
      metadata: {
        autoUpgraded: "true",
        previousPlanId: String(user.planId),
        newPlanId: String(nextPlan.id),
        upgradeReason: "click_overage",
      },
    });

    await storage.updateUser(userId, { planId: nextPlan.id });

    await storage.createSuspensionHistoryEntry({
      userId,
      event: "unsuspended",
      reason: "auto_upgrade",
      details: `Auto-upgraded from "${currentPlan.name}" to "${nextPlan.name}" due to click overage (120% threshold)`,
      actorType: "system",
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });

    console.log(
      `[LimitEnforcer] ✓ Auto-upgrade successful: user=${userId}, new plan: "${nextPlan.name}"`
    );
    return "upgraded";
  } catch (err: any) {
    console.error(
      `[LimitEnforcer] ✗ Auto-upgrade failed for user ${userId}:`,
      err.message
    );
    return "stripe_failed";
  }
}

// ============================================================
// OVERAGE HANDLING
// ============================================================

/**
 * Called when a user exceeds 120% of their monthly click limit.
 *
 * Flow:
 *  1. Skip if already in grace period or suspended (idempotent)
 *  2. Acquire DB-persisted billing lock (multi-instance safe, 5-min TTL)
 *  3. Attempt auto-upgrade via Stripe
 *  4. If upgraded → notify user, done
 *  5. If upgrade fails/unavailable → start 72h grace period + notify
 *  6. Always release lock in finally block
 *
 * This is designed to be called fire-and-forget (does not block cloaker).
 */
export async function handleClickOverage(
  userId: string,
  clicksUsed: number,
  plan: Plan
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;

  // Idempotent: skip if already handled
  if (user.gracePeriodEndsAt || user.suspendedAt) {
    return;
  }

  // Persistent concurrency guard — atomic UPDATE in DB, safe across multiple server instances
  const lockAcquired = await storage.acquireBillingLock(userId, 5);
  if (!lockAcquired) {
    // Another instance already holds the lock — skip silently
    return;
  }

  try {
    const limit = plan.maxClicks;
    const toleranceLimit = Math.ceil(limit * OVERAGE_THRESHOLD_FACTOR);

    console.log(
      `[LimitEnforcer] 🔴 Click overage: user=${userId}, clicks=${clicksUsed}, ` +
        `limit=${limit}, tolerance_limit=${toleranceLimit}`
    );
    console.log(`[LimitEnforcer] Auto-upgrade initiated for user ${userId}`);

    const upgradeResult = await attemptAutoUpgrade(userId);

    if (upgradeResult === "upgraded") {
      console.log(
        `[LimitEnforcer] ✓ Auto-upgrade successful for user ${userId} — no grace period needed`
      );
      try {
        await storage.createNotification({
          userId,
          type: "plan_upgraded",
          titlePt: "Plano atualizado automaticamente",
          titleEn: "Plan automatically upgraded",
          messagePt: `Seu volume de clicks ultrapassou 120% do limite. Seu plano foi atualizado automaticamente para o próximo nível. Uma cobrança proporcional foi aplicada.`,
          messageEn: `Your click volume exceeded 120% of the limit. Your plan was automatically upgraded to the next tier. A prorated charge was applied.`,
        });
      } catch (e) {}
      return;
    }

    // Upgrade failed or not available → grace period
    // Re-fetch user to guard against any state change that happened between lock acquisition and now
    const freshUser = await storage.getUser(userId);
    if (freshUser?.gracePeriodEndsAt || freshUser?.suspendedAt) {
      console.log(`[LimitEnforcer] User ${userId} — grace/suspension already set after lock, skipping`);
      return;
    }

    console.log(
      `[LimitEnforcer] ⚠ Grace period started for user ${userId} (upgrade result: ${upgradeResult})`
    );
    await storage.startGracePeriod(userId);

    // Send plan_limit email notification
    if (user.email) {
      sendPlanLimitEmail(user.email, "clicks", clicksUsed, limit, plan.name, userId).catch(err => {
        console.error(`[LimitEnforcer] Failed to send plan_limit email for user ${userId}:`, err.message);
      });
    }

    // In-app notification
    try {
      await storage.createNotification({
        userId,
        type: "grace_period_started",
        titlePt: "Limite de clicks atingido — período de carência iniciado",
        titleEn: "Click limit reached — grace period started",
        messagePt: `Você ultrapassou 120% do limite do seu plano (${clicksUsed.toLocaleString()} de ${limit.toLocaleString()} clicks). Seus redirects continuam ativos por 72 horas. Faça upgrade para evitar a suspensão da conta.`,
        messageEn: `You exceeded 120% of your plan limit (${clicksUsed.toLocaleString()} of ${limit.toLocaleString()} clicks). Your redirects remain active for 72 hours. Please upgrade to avoid account suspension.`,
      });
    } catch (e) {}
  } finally {
    await storage.releaseBillingLock(userId).catch((err: any) =>
      console.error(`[LimitEnforcer] Failed to release billing lock for user ${userId}:`, err.message)
    );
  }
}

// ============================================================
// GRACE PERIOD EXPIRY SCHEDULER
// ============================================================

/**
 * Scheduler job: finds users whose grace period has expired
 * and have not yet been explicitly suspended, then suspends them.
 *
 * Run periodically (every 15 minutes via startLimitEnforcer).
 */
export async function processExpiredGracePeriods(): Promise<void> {
  console.log("[LimitEnforcer] Checking for expired grace periods...");
  try {
    const usersToSuspend = await storage.getUsersWithExpiredGracePeriod();

    if (usersToSuspend.length === 0) {
      console.log("[LimitEnforcer] No expired grace periods found");
      return;
    }

    console.log(
      `[LimitEnforcer] Found ${usersToSuspend.length} user(s) with expired grace period — suspending`
    );

    for (const user of usersToSuspend) {
      try {
        await storage.suspendUser(user.id, "grace_period_expired");
        console.log(
          `[LimitEnforcer] 🚫 User ${user.id} (${user.email}) suspended — grace period expired`
        );

        try {
          await storage.createNotification({
            userId: user.id,
            type: "account_suspended",
            titlePt: "Conta suspensa",
            titleEn: "Account suspended",
            messagePt:
              "Seu período de carência expirou. Regularize sua assinatura para reativar o acesso. Todos os seus dados foram preservados.",
            messageEn:
              "Your grace period has expired. Please settle your subscription to restore access. All your data has been preserved.",
          });
        } catch (e) {}

        // Send account_suspended email
        if (user.email) {
          sendAccountSuspendedEmail(
            user.email,
            user.firstName || 'Cliente',
            'Período de carência expirado',
            user.id
          ).catch(err => {
            console.error(`[LimitEnforcer] Failed to send account_suspended email for user ${user.id}:`, err.message);
          });
        }
      } catch (userErr: any) {
        console.error(
          `[LimitEnforcer] Failed to suspend user ${user.id}:`,
          userErr.message
        );
      }
    }

    console.log(
      `[LimitEnforcer] ✓ Grace period sweep complete — ${usersToSuspend.length} user(s) suspended`
    );
  } catch (err: any) {
    console.error(
      "[LimitEnforcer] Error in processExpiredGracePeriods:",
      err.message
    );
  }
}

/**
 * Starts the periodic grace period enforcement scheduler.
 * Runs immediately on startup, then every 15 minutes.
 */
export function startLimitEnforcer(): void {
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  console.log(
    "[LimitEnforcer] Starting — grace period expiry check every 15 minutes"
  );

  // Immediate run
  processExpiredGracePeriods().catch((err: any) =>
    console.error("[LimitEnforcer] Startup sweep error:", err.message)
  );

  // Periodic run
  setInterval(() => {
    processExpiredGracePeriods().catch((err: any) =>
      console.error("[LimitEnforcer] Periodic sweep error:", err.message)
    );
  }, INTERVAL_MS);
}
