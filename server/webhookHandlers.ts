import { getStripeSync, isStripeConfigured, getStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid?: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const configured = await isStripeConfigured();
    if (!configured) {
      console.log('Stripe not configured, skipping webhook processing');
      return;
    }

    try {
      const sync = await getStripeSync();
      const event = await sync.processWebhook(payload, signature, uuid);
      console.log('Webhook processed successfully via stripe-replit-sync');
      
      await this.handleStripeEvent(event);
    } catch (error: any) {
      console.error('Stripe webhook processing error:', error.message);
      
      if (error.message?.includes('No webhook signing secret')) {
        console.log('Managed webhook not yet configured, this is expected on first startup');
        return;
      }
      
      throw error;
    }
  }

  static async handleStripeEvent(event: any): Promise<void> {
    console.log(`[WebhookHandlers] Processing event: ${event.type}`);
    
    switch (event.type) {
      case 'checkout.session.completed': {
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      }
      
      case 'customer.subscription.deleted': {
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      }
      
      case 'invoice.payment_failed': {
        await this.handlePaymentFailed(event.data.object);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        await this.handlePaymentSucceeded(event.data.object);
        break;
      }
    }
  }

  private static async handleCheckoutSessionCompleted(session: any): Promise<void> {
    const userId = session.metadata?.userId;
    const planIdStr = session.metadata?.planId;
    const setupMode = session.metadata?.setupMode;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const setupIntentId = session.setup_intent;

    console.log(`[WebhookHandlers] checkout.session.completed - userId: ${userId}, planId: ${planIdStr}, customerId: ${customerId}, subscriptionId: ${subscriptionId}, setupMode: ${setupMode}`);

    if (setupMode === 'true' && setupIntentId && customerId) {
      try {
        const stripe = await getStripeClient();
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        const paymentMethodId = setupIntent.payment_method as string;
        
        if (paymentMethodId) {
          await stripe.customers.update(customerId, {
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          });
          console.log(`[WebhookHandlers] Set payment method ${paymentMethodId} as default for customer ${customerId}`);
        }
      } catch (err) {
        console.error('[WebhookHandlers] Error setting default payment method:', err);
      }
      return;
    }

    if (!userId) {
      console.log('[WebhookHandlers] No userId in session metadata, skipping user update');
      return;
    }

    const user = await storage.getUser(userId);
    if (!user) {
      console.log(`[WebhookHandlers] User ${userId} not found, skipping update`);
      return;
    }

    const updateData: any = {
      stripeCustomerId: customerId,
    };

    if (subscriptionId) {
      updateData.stripeSubscriptionId = subscriptionId;
      updateData.subscriptionStatus = 'active';
      
      const subscriptionStartTimestamp = session.created;
      if (subscriptionStartTimestamp) {
        updateData.subscriptionStartDate = new Date(subscriptionStartTimestamp * 1000);
      } else {
        updateData.subscriptionStartDate = new Date();
      }
    }

    if (planIdStr) {
      const parsedPlanId = parseInt(planIdStr, 10);
      if (!isNaN(parsedPlanId)) {
        updateData.planId = parsedPlanId;
      } else {
        console.log(`[WebhookHandlers] Invalid planId in metadata: ${planIdStr}`);
      }
    }

    await storage.updateUser(userId, updateData);
    console.log(`[WebhookHandlers] Updated user ${userId} with subscription data:`, updateData);
  }

  private static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    const status = subscription.status;

    console.log(`[WebhookHandlers] subscription.updated - customerId: ${customerId}, subscriptionId: ${subscriptionId}, status: ${status}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[WebhookHandlers] User with stripeCustomerId ${customerId} not found, skipping update`);
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
      if (newPlan) {
        updateData.planId = newPlan.id;
      }
    }

    // Auto-unsuspend if user upgraded and new plan accommodates their usage
    if (status === 'active' && user.suspendedAt && newPlan) {
      const clicksThisMonth = user.clicksUsedThisMonth || 0;
      
      // Check if new plan can accommodate the user's current click usage
      if (newPlan.isUnlimited || clicksThisMonth <= newPlan.maxClicks) {
        updateData.suspendedAt = null;
        updateData.suspensionReason = null;
        updateData.gracePeriodEndsAt = null;
        
        // Log the unsuspension
        await storage.createSuspensionHistoryEntry({
          userId: user.id,
          event: 'unsuspended',
          reason: 'plan_upgrade',
          details: `User upgraded to plan ${newPlan.name} which accommodates their usage`,
          actorType: 'system',
          clicksAtEvent: clicksThisMonth,
          planIdAtEvent: newPlan.id,
        });
        
        console.log(`[WebhookHandlers] Auto-unsuspended user ${user.id} due to plan upgrade to ${newPlan.name}`);
      }
    }

    await storage.updateUser(user.id, updateData);
    console.log(`[WebhookHandlers] Updated user ${user.id} with subscription update:`, updateData);
  }

  private static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const customerId = subscription.customer;

    console.log(`[WebhookHandlers] subscription.deleted - customerId: ${customerId}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[WebhookHandlers] User with stripeCustomerId ${customerId} not found, skipping update`);
      return;
    }

    // Start 3-day grace period for renewal
    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setHours(gracePeriodEndsAt.getHours() + 72);

    const updateData: any = {
      subscriptionStatus: 'canceled',
      subscriptionEndDate: subscription.ended_at 
        ? new Date(subscription.ended_at * 1000) 
        : new Date(),
      gracePeriodEndsAt,
    };

    await storage.updateUser(user.id, updateData);
    
    // Log the grace period start
    await storage.createSuspensionHistoryEntry({
      userId: user.id,
      event: 'grace_started',
      reason: 'subscription_canceled',
      details: `Subscription canceled. Grace period for renewal until ${gracePeriodEndsAt.toISOString()} (3 days)`,
      actorType: 'system',
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });
    
    console.log(`[WebhookHandlers] Updated user ${user.id} - subscription canceled, grace period until ${gracePeriodEndsAt.toISOString()}`);
  }

  private static async handlePaymentFailed(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const invoiceId = invoice.id;
    const failedPaymentMethodId = invoice.default_payment_method || invoice.payment_intent?.payment_method;

    console.log(`[WebhookHandlers] invoice.payment_failed - customerId: ${customerId}, invoiceId: ${invoiceId}, failedPM: ${failedPaymentMethodId}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[WebhookHandlers] User with stripeCustomerId ${customerId} not found, skipping update`);
      return;
    }

    try {
      const stripe = await getStripeClient();
      
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      const otherCards = paymentMethods.data.filter(pm => pm.id !== failedPaymentMethodId);
      
      if (otherCards.length > 0 && invoice.status === 'open') {
        const nextCard = otherCards[0];
        console.log(`[WebhookHandlers] Trying fallback card ${nextCard.id} for invoice ${invoiceId}`);
        
        await stripe.invoices.update(invoiceId, {
          default_payment_method: nextCard.id,
        });
        
        try {
          await stripe.invoices.pay(invoiceId);
          console.log(`[WebhookHandlers] Fallback payment successful with card ${nextCard.id}`);
          return;
        } catch (payError: any) {
          console.log(`[WebhookHandlers] Fallback payment failed with card ${nextCard.id}: ${payError.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[WebhookHandlers] Error during fallback payment attempt: ${err.message}`);
    }

    // Start 3-day grace period for renewal
    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setHours(gracePeriodEndsAt.getHours() + 72);
    
    await storage.updateUser(user.id, {
      subscriptionStatus: 'past_due',
      gracePeriodEndsAt,
    });
    
    // Log the grace period start
    await storage.createSuspensionHistoryEntry({
      userId: user.id,
      event: 'grace_started',
      reason: 'payment_failed',
      details: `Payment failed. Grace period for renewal until ${gracePeriodEndsAt.toISOString()} (3 days)`,
      actorType: 'system',
      clicksAtEvent: user.clicksUsedThisMonth,
      planIdAtEvent: user.planId,
    });
    
    console.log(`[WebhookHandlers] Updated user ${user.id} - payment failed, status: past_due, grace period until ${gracePeriodEndsAt.toISOString()}`);
  }

  private static async handlePaymentSucceeded(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const subscriptionId = invoice.subscription;

    if (!subscriptionId) {
      console.log('[WebhookHandlers] invoice.payment_succeeded - no subscription, skipping');
      return;
    }

    console.log(`[WebhookHandlers] invoice.payment_succeeded - customerId: ${customerId}, subscriptionId: ${subscriptionId}`);

    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.log(`[WebhookHandlers] User with stripeCustomerId ${customerId} not found, skipping update`);
      return;
    }

    if (user.subscriptionStatus !== 'active' || user.gracePeriodEndsAt) {
      await storage.updateUser(user.id, {
        subscriptionStatus: 'active',
        stripeSubscriptionId: subscriptionId,
        gracePeriodEndsAt: null,
      });
      console.log(`[WebhookHandlers] Updated user ${user.id} - payment succeeded, status: active, grace period cleared`);
    }
  }
}
