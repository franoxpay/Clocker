import { getStripeSync, isStripeConfigured } from './stripeClient';
import { storage } from './storage';

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

    const configured = await isStripeConfigured();
    if (!configured) {
      console.log('Stripe not configured, skipping webhook processing');
      return;
    }

    try {
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
      console.log('Webhook processed successfully via stripe-replit-sync');
    } catch (error: any) {
      console.error('Stripe webhook processing error:', error.message);
      
      if (error.message?.includes('No webhook signing secret')) {
        console.log('Managed webhook not yet configured, this is expected on first startup');
        return;
      }
      
      throw error;
    }
  }
}
