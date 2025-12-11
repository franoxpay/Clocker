import { getStripeClient, getStripeWebhookSecret } from './stripeClient';
import { storage } from './storage';
import Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private static async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    
    if (!userId || !planId) {
      console.error('Missing userId or planId in checkout session metadata');
      return;
    }

    try {
      await storage.updateUser(userId, {
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: session.subscription as string,
        subscriptionStatus: 'active',
        planId: parseInt(planId),
      });
      console.log(`User ${userId} subscription activated for plan ${planId}`);
    } catch (error) {
      console.error('Error updating user subscription:', error);
    }
  }

  private static async handleSubscriptionUpdate(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    
    try {
      const users = await storage.getUserByStripeCustomerId(customerId);
      if (!users) {
        console.error(`No user found for customer ${customerId}`);
        return;
      }

      await storage.updateUser(users.id, {
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
      });
      console.log(`User ${users.id} subscription updated to ${subscription.status}`);
    } catch (error) {
      console.error('Error updating subscription:', error);
    }
  }

  private static async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    
    try {
      const users = await storage.getUserByStripeCustomerId(customerId);
      if (!users) {
        console.error(`No user found for customer ${customerId}`);
        return;
      }

      await storage.updateUser(users.id, {
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
      });
      console.log(`User ${users.id} subscription canceled`);
    } catch (error) {
      console.error('Error handling subscription deletion:', error);
    }
  }

  private static async handlePaymentSucceeded(invoice: Stripe.Invoice) {
    console.log(`Payment succeeded for invoice ${invoice.id}`);
  }

  private static async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    
    try {
      const users = await storage.getUserByStripeCustomerId(customerId);
      if (!users) {
        console.error(`No user found for customer ${customerId}`);
        return;
      }

      await storage.updateUser(users.id, {
        subscriptionStatus: 'past_due',
      });
      console.log(`User ${users.id} payment failed, status set to past_due`);
    } catch (error) {
      console.error('Error handling payment failure:', error);
    }
  }
}
