import Stripe from 'stripe';
import { getStripeSync, isStripeConfigured, getStripeClient, getStripeWebhookSecret } from './stripeClient';
import { storage } from './storage';
import { sendSubscriptionConfirmationEmail } from './email';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid?: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        '[Stripe Webhook] Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const configured = await isStripeConfigured();
    if (!configured) {
      console.log('[Stripe Webhook] Stripe not configured, skipping webhook processing');
      return;
    }

    console.log(`[Stripe Webhook] Received webhook — signature present: ${!!signature}, uuid: ${uuid || 'none'}`);

    // Try stripe-replit-sync managed webhook first
    try {
      const sync = await getStripeSync();
      const event = await sync.processWebhook(payload, signature, uuid);
      console.log(`[Stripe Webhook] Processed via stripe-replit-sync: ${event?.type}`);
      await this.handleStripeEvent(event);
      return;
    } catch (syncError: any) {
      const isNoSecret = syncError.message?.includes('No webhook signing secret');
      const isNotManaged = syncError.message?.includes('not managed');
      if (isNoSecret || isNotManaged) {
        console.log('[Stripe Webhook] Managed webhook not configured, trying direct verification...');
      } else {
        console.warn('[Stripe Webhook] stripe-replit-sync error:', syncError.message);
      }
    }

    // Fallback: direct Stripe webhook verification using STRIPE_WEBHOOK_SECRET
    const webhookSecret = getStripeWebhookSecret();
    if (!webhookSecret) {
      console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set — cannot verify webhook signature. Skipping.');
      return;
    }

    try {
      const stripe = await getStripeClient();
      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      console.log(`[Stripe Webhook] Verified directly — event: ${event.type}`);
      await this.handleStripeEvent(event);
    } catch (verifyError: any) {
      console.error('[Stripe Webhook] Invalid signature:', verifyError.message);
      throw verifyError;
    }
  }

  static async handleStripeEvent(event: any): Promise<void> {
    if (!event || !event.type) {
      console.log('[Stripe Webhook] Received undefined or invalid event, skipping');
      return;
    }

    console.log(`[Stripe Webhook] Processing event: ${event.type} (id: ${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  }

  private static async handleCheckoutSessionCompleted(session: any): Promise<void> {
    const userId = session.metadata?.userId;
    const planIdStr = session.metadata?.planId;
    const setupMode = session.metadata?.setupMode;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const setupIntentId = session.setup_intent;

    console.log(`[Stripe Webhook] checkout.session.completed — userId: ${userId}, planId: ${planIdStr}, customerId: ${customerId}, subscriptionId: ${subscriptionId}, setupMode: ${setupMode}`);

    if (setupMode === 'true' && setupIntentId && customerId) {
      try {
        const stripe = await getStripeClient();
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        const paymentMethodId = setupIntent.payment_method as string;

        if (paymentMethodId) {
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
          console.log(`[Stripe Webhook] Set default payment method ${paymentMethodId} for customer ${customerId}`);
        }
      } catch (err: any) {
        console.error('[Stripe Webhook] Error setting default payment method:', err.message);
      }
      return;
    }

    if (!userId) {
      console.log('[Stripe Webhook] No userId in session metadata, skipping user update');
      return;
    }

    const user = await storage.getUser(userId);
    if (!user) {
      console.log(`[Stripe Webhook] User ${userId} not found, skipping update`);
      return;
    }

    const updateData: any = { stripeCustomerId: customerId };

    if (subscriptionId) {
      updateData.stripeSubscriptionId = subscriptionId;
      updateData.subscriptionStatus = 'active';
      updateData.subscriptionStartDate = session.created
        ? new Date(session.created * 1000)
        : new Date();
    }

    if (planIdStr) {
      const parsedPlanId = parseInt(planIdStr, 10);
      if (!isNaN(parsedPlanId)) {
        updateData.planId = parsedPlanId;
      } else {
        console.log(`[Stripe Webhook] Invalid planId in metadata: ${planIdStr}`);
      }
    }

    await storage.updateUser(userId, updateData);
    console.log(`[Stripe Webhook] ✓ Subscription activated — user: ${userId}, subscription: ${subscriptionId}`);

    // Send subscription confirmation email
    if (planIdStr && subscriptionId) {
      const updatedUser = await storage.getUser(userId);
      const plan = await storage.getPlan(parseInt(planIdStr, 10));
      if (updatedUser?.email && plan) {
        sendSubscriptionConfirmationEmail(updatedUser.email, plan.name, userId).catch(err => {
          console.error('[Stripe Webhook] Failed to send subscription confirmation email:', err.message);
        });
      }
    }

    // Process coupon usage and commission
    const couponIdStr = session.metadata?.couponId || session.subscription_data?.metadata?.couponId;
    const affiliateUserId = session.metadata?.affiliateUserId || session.subscription_data?.metadata?.affiliateUserId;

    if (couponIdStr && subscriptionId) {
      const couponId = parseInt(couponIdStr, 10);
      if (!isNaN(couponId)) {
        await this.processCouponUsageAndCommission(couponId, userId, affiliateUserId, subscriptionId, session.amount_total);
      }
    }
  }

  private static async processCouponUsageAndCommission(
    couponId: number,
    userId: string,
    affiliateUserId: string | undefined,
    subscriptionId: string,
    amountPaid: number
  ): Promise<void> {
    try {
      const coupon = await storage.getCoupon(couponId);
      if (!coupon) {
        console.log(`[Stripe Webhook] Coupon ${couponId} not found, skipping coupon processing`);
        return;
      }

      const existingUsage = await storage.getCouponUsageByUserId(userId);
      if (!existingUsage) {
        await storage.createCouponUsage({
          couponId,
          userId,
          stripeSubscriptionId: subscriptionId,
          discountApplied: coupon.discountType === 'percentage'
            ? Math.round(amountPaid * (coupon.discountValue / 100))
            : coupon.discountValue,
        });
        console.log(`[Stripe Webhook] Recorded coupon usage for user ${userId}, coupon ${couponId}`);
      }

      if (affiliateUserId && coupon.commissionType && coupon.commissionValue) {
        const affiliate = await storage.getUser(affiliateUserId);
        if (affiliate && affiliate.subscriptionStatus === 'active') {
          let commissionAmount: number;
          if (coupon.commissionType === 'percentage') {
            commissionAmount = Math.round(amountPaid * (coupon.commissionValue / 100));
          } else {
            commissionAmount = coupon.commissionValue;
          }

          const existingCommissions = await storage.getCommissionsByReferredUserId(userId);
          const maxCommissions = coupon.commissionDurationMonths || 1;

          if (existingCommissions.length >= maxCommissions) {
            console.log(`[Stripe Webhook] Skipping commission for affiliate ${affiliateUserId} — reached limit of ${maxCommissions}`);
            return;
          }

          await storage.createCommission({
            affiliateUserId,
            referredUserId: userId,
            couponId,
            stripeSubscriptionId: subscriptionId,
            amount: commissionAmount,
            status: 'pending',
          });
          console.log(`[Stripe Webhook] Created commission of ${commissionAmount} for affiliate ${affiliateUserId}`);
        } else {
          console.log(`[Stripe Webhook] Affiliate ${affiliateUserId} not active, skipping commission`);
        }
      }
    } catch (error: any) {
      console.error('[Stripe Webhook] Error processing coupon/commission:', error.message);
    }
  }

  private static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    const status = subscription.status;

    console.log(`[Stripe Webhook] subscription.updated — customerId: ${customerId}, subscriptionId: ${subscriptionId}, status: ${status}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[Stripe Webhook] No user found for stripeCustomerId ${customerId}, skipping`);
      return;
    }

    const updateData: any = {
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: status,
    };

    if (subscription.current_period_end) {
      updateData.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
    }
    if (subscription.current_period_start && status === 'active') {
      updateData.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
    }

    let newPlan = null;
    if (subscription.items?.data?.[0]?.price?.id) {
      const priceId = subscription.items.data[0].price.id;
      newPlan = await storage.getPlanByStripePriceId(priceId);
      if (newPlan) updateData.planId = newPlan.id;
    }

    const isNowActive = status === 'active' || status === 'trialing';

    if (isNowActive && user.suspendedAt && newPlan) {
      const clicksThisMonth = user.clicksUsedThisMonth || 0;
      if (newPlan.isUnlimited || clicksThisMonth <= newPlan.maxClicks) {
        updateData.suspendedAt = null;
        updateData.suspensionReason = null;
        updateData.gracePeriodEndsAt = null;

        await storage.createSuspensionHistoryEntry({
          userId: user.id,
          event: 'unsuspended',
          reason: 'plan_upgrade',
          details: `User upgraded to plan ${newPlan.name}`,
          actorType: 'system',
          clicksAtEvent: clicksThisMonth,
          planIdAtEvent: newPlan.id,
        });

        console.log(`[Stripe Webhook] Auto-unsuspended user ${user.id} — plan: ${newPlan.name}`);
      }
    }

    if (isNowActive && newPlan) {
      updateData.gracePeriodEndsAt = null;
      await storage.updateUser(user.id, updateData);
      await storage.restoreUserSubscription(user.id, newPlan.id, status);
      console.log(`[Stripe Webhook] ✓ Subscription activated — user: ${user.id}, plan: ${newPlan.name}, status: ${status}`);
    } else if (!isNowActive) {
      await storage.updateUser(user.id, updateData);
      await storage.downgradeUserToFreePlan(user.id);
      console.log(`[Stripe Webhook] ✓ Subscription inactive — user: ${user.id} downgraded to free plan (status: ${status})`);
    } else {
      await storage.updateUser(user.id, updateData);
    }
  }

  private static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const customerId = subscription.customer;

    console.log(`[Stripe Webhook] subscription.deleted — customerId: ${customerId}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[Stripe Webhook] No user found for stripeCustomerId ${customerId}, skipping`);
      return;
    }

    await storage.updateUser(user.id, {
      subscriptionEndDate: subscription.ended_at
        ? new Date(subscription.ended_at * 1000)
        : new Date(),
    });
    await storage.downgradeUserToFreePlan(user.id);

    await storage.createSuspensionHistoryEntry({
      userId: user.id,
      event: 'grace_started',
      reason: 'subscription_canceled',
      details: 'Subscription canceled. User immediately downgraded to free plan.',
      actorType: 'system',
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });

    console.log(`[Stripe Webhook] ✓ Subscription canceled — user: ${user.id} downgraded to free plan`);

    await this.reversePendingCommissionsForUser(user.id, 'subscription_canceled_early');
  }

  private static async reversePendingCommissionsForUser(userId: string, reason: string): Promise<void> {
    try {
      const commissions = await storage.getCommissionsByReferredUserId(userId);
      const pending = commissions.filter(c => c.status === 'pending');
      for (const commission of pending) {
        await storage.reverseCommission(commission.id, reason);
        console.log(`[Stripe Webhook] Reversed commission ${commission.id} for user ${userId}`);
      }
      if (pending.length > 0) {
        console.log(`[Stripe Webhook] Reversed ${pending.length} pending commissions for user ${userId}`);
      }
    } catch (error: any) {
      console.error(`[Stripe Webhook] Error reversing commissions for user ${userId}:`, error.message);
    }
  }

  private static async handlePaymentFailed(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const invoiceId = invoice.id;
    const failedPaymentMethodId = invoice.default_payment_method || invoice.payment_intent?.payment_method;

    console.log(`[Stripe Webhook] invoice.payment_failed — customerId: ${customerId}, invoiceId: ${invoiceId}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[Stripe Webhook] No user found for stripeCustomerId ${customerId}, skipping`);
      return;
    }

    // Try fallback card
    try {
      const stripe = await getStripeClient();
      const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
      const otherCards = paymentMethods.data.filter(pm => pm.id !== failedPaymentMethodId);

      if (otherCards.length > 0 && invoice.status === 'open') {
        const nextCard = otherCards[0];
        console.log(`[Stripe Webhook] Trying fallback card ${nextCard.id} for invoice ${invoiceId}`);
        await stripe.invoices.update(invoiceId, { default_payment_method: nextCard.id });
        try {
          await stripe.invoices.pay(invoiceId);
          console.log(`[Stripe Webhook] Fallback payment succeeded with card ${nextCard.id}`);
          return;
        } catch (payError: any) {
          console.log(`[Stripe Webhook] Fallback payment also failed: ${payError.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[Stripe Webhook] Error during fallback payment attempt: ${err.message}`);
    }

    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setHours(gracePeriodEndsAt.getHours() + 72);

    await storage.updateUser(user.id, { subscriptionStatus: 'past_due', gracePeriodEndsAt });

    await storage.createSuspensionHistoryEntry({
      userId: user.id,
      event: 'grace_started',
      reason: 'payment_failed',
      details: `Payment failed. Grace period until ${gracePeriodEndsAt.toISOString()} (72h)`,
      actorType: 'system',
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });

    console.log(`[Stripe Webhook] ✓ Payment failed — user: ${user.id} set to past_due, grace period until ${gracePeriodEndsAt.toISOString()}`);
  }

  private static async handlePaymentSucceeded(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const subscriptionId = invoice.subscription;

    if (!subscriptionId) {
      console.log('[Stripe Webhook] invoice.payment_succeeded — no subscription, skipping');
      return;
    }

    console.log(`[Stripe Webhook] invoice.payment_succeeded — customerId: ${customerId}, subscriptionId: ${subscriptionId}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[Stripe Webhook] No user found for stripeCustomerId ${customerId}, skipping`);
      return;
    }

    if (user.subscriptionStatus !== 'active' || user.gracePeriodEndsAt) {
      await storage.updateUser(user.id, {
        subscriptionStatus: 'active',
        stripeSubscriptionId: subscriptionId,
        gracePeriodEndsAt: null,
      });
      console.log(`[Stripe Webhook] ✓ Payment succeeded — user: ${user.id} restored to active, grace period cleared`);
    }
  }
}
