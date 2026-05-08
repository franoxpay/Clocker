/**
 * syncService.ts
 *
 * Centralized Stripe ↔ database synchronization.
 * Call syncUserSubscriptionState(userId) to compare Stripe's source of truth
 * with the local DB and correct any divergence atomically.
 *
 * Safe to call at any time — it is fully idempotent.
 */

import { storage } from "./storage";
import { getStripeClient, isStripeConfigured } from "./stripeClient";

export interface SyncResult {
  userId: string;
  changed: boolean;
  corrections: string[];
  error?: string;
}

/**
 * Syncs a single user's subscription state between Stripe and the database.
 * Detects and corrects the following inconsistencies:
 *
 *  - Stripe active  + DB suspended  → unsuspend, restore offers
 *  - Stripe active  + DB grace set  → clear grace, restore offers
 *  - Stripe canceled + DB active    → downgrade to free
 *  - Stripe plan    ≠ DB plan       → correct planId
 *  - Grace expired  + not suspended → suspend (scheduler catchup)
 */
export async function syncUserSubscriptionState(userId: string): Promise<SyncResult> {
  const result: SyncResult = { userId, changed: false, corrections: [] };

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      result.error = `User ${userId} not found`;
      return result;
    }

    // ── Local-only checks (no Stripe call needed) ──────────────────────────────

    // Grace period expired but not yet suspended → suspend now (scheduler catchup)
    if (user.gracePeriodEndsAt && new Date() > user.gracePeriodEndsAt && !user.suspendedAt) {
      await storage.suspendUser(userId, "grace_period_expired_sync");
      result.corrections.push("Suspended: grace period expired (scheduler catchup)");
      result.changed = true;
    }

    // Both suspendedAt and gracePeriodEndsAt set simultaneously → clear grace
    if (user.suspendedAt && user.gracePeriodEndsAt) {
      await storage.updateUser(userId, { gracePeriodEndsAt: null });
      result.corrections.push("Cleared orphan gracePeriodEndsAt (user already suspended)");
      result.changed = true;
    }

    // ── Stripe-based checks ────────────────────────────────────────────────────

    if (!user.stripeSubscriptionId) {
      console.log(`[SyncService] User ${userId} has no stripeSubscriptionId — local checks only`);
      return result;
    }

    const stripeReady = await isStripeConfigured();
    if (!stripeReady) {
      result.error = "Stripe not configured — skipping remote sync";
      return result;
    }

    let stripeSub: any;
    try {
      const stripe = await getStripeClient();
      stripeSub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch (err: any) {
      if (err.code === "resource_missing") {
        // Subscription no longer exists in Stripe
        if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") {
          await storage.downgradeUserToFreePlan(userId);
          result.corrections.push(
            `Downgraded: subscription ${user.stripeSubscriptionId} not found in Stripe`
          );
          result.changed = true;
        }
        return result;
      }
      result.error = `Stripe error: ${err.message}`;
      return result;
    }

    const stripeStatus = stripeSub.status as string;
    const isStripeActive = stripeStatus === "active" || stripeStatus === "trialing";
    const isStripeEnded = ["canceled", "unpaid", "incomplete_expired"].includes(stripeStatus);

    // ── Stripe active but DB shows suspended or grace ──────────────────────────
    if (isStripeActive && (user.suspendedAt || user.gracePeriodEndsAt)) {
      const updates: any = {
        subscriptionStatus: stripeStatus,
        suspendedAt: null,
        suspensionReason: null,
        gracePeriodEndsAt: null,
      };
      await storage.updateUser(userId, updates);
      if (user.planId) {
        await storage.restoreUserSubscription(userId, user.planId, stripeStatus);
      }
      result.corrections.push(
        `Cleared ${user.suspendedAt ? "suspension" : "grace period"}: Stripe shows active (${stripeStatus})`
      );
      result.changed = true;
    }

    // ── Stripe active but DB status doesn't match ──────────────────────────────
    if (isStripeActive && user.subscriptionStatus !== stripeStatus) {
      await storage.updateUser(userId, { subscriptionStatus: stripeStatus });
      result.corrections.push(`Updated subscriptionStatus: ${user.subscriptionStatus} → ${stripeStatus}`);
      result.changed = true;
    }

    // ── Stripe ended but DB shows active ──────────────────────────────────────
    if (isStripeEnded && (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing")) {
      await storage.updateUser(userId, { subscriptionStatus: stripeStatus });
      await storage.downgradeUserToFreePlan(userId);
      result.corrections.push(
        `Downgraded: Stripe status=${stripeStatus} but DB had subscriptionStatus=${user.subscriptionStatus}`
      );
      result.changed = true;
    }

    // ── Plan mismatch between Stripe and DB ────────────────────────────────────
    if (isStripeActive && stripeSub.items?.data?.[0]?.price?.id) {
      const stripePriceId = stripeSub.items.data[0].price.id;
      const stripePlan = await storage.getPlanByStripePriceId(stripePriceId);
      if (stripePlan && stripePlan.id !== user.planId) {
        await storage.updateUser(userId, { planId: stripePlan.id });
        result.corrections.push(
          `Fixed planId: DB had ${user.planId}, Stripe has ${stripePlan.id} (${stripePlan.name})`
        );
        result.changed = true;
      }
    }

    if (result.changed) {
      console.log(
        `[SyncService] ✓ User ${userId} synced — ${result.corrections.length} correction(s): ${result.corrections.join("; ")}`
      );
    } else {
      console.log(`[SyncService] User ${userId} — no corrections needed`);
    }
  } catch (err: any) {
    result.error = err.message;
    console.error(`[SyncService] Error syncing user ${userId}:`, err.message);
  }

  return result;
}

/**
 * Runs syncUserSubscriptionState across all users that have a Stripe subscription
 * and may be in an inconsistent state. Safe to run periodically.
 *
 * Returns a summary of all corrections made.
 */
export async function syncAllUsers(): Promise<{
  checked: number;
  corrected: number;
  errors: number;
  corrections: SyncResult[];
}> {
  console.log("[SyncService] Starting full user subscription sync...");

  const inconsistencies = await storage.getUsersWithSubscriptionInconsistencies();
  const results: SyncResult[] = [];
  let corrected = 0;
  let errors = 0;

  for (const { user } of inconsistencies) {
    const result = await syncUserSubscriptionState(user.id);
    results.push(result);
    if (result.error) errors++;
    if (result.changed) corrected++;
  }

  console.log(
    `[SyncService] Sync complete — checked: ${inconsistencies.length}, corrected: ${corrected}, errors: ${errors}`
  );

  return {
    checked: inconsistencies.length,
    corrected,
    errors,
    corrections: results.filter(r => r.changed || r.error),
  };
}
