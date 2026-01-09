import Stripe from 'stripe';

let connectionSettings: any;
let stripeClient: Stripe | null = null;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    return {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.STRIPE_SECRET_KEY || '',
    };
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';
  const connectorName = 'stripe';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    return {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.STRIPE_SECRET_KEY || '',
    };
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

export async function getStripeClient(): Promise<Stripe> {
  if (!stripeClient) {
    const { secretKey } = await getCredentials();
    if (!secretKey) {
      throw new Error('Stripe secret key not found');
    }
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  if (!publishableKey) {
    throw new Error('Stripe publishable key not found');
  }
  return publishableKey;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not found in environment variables');
  }
  return webhookSecret;
}

export async function isStripeConfigured(): Promise<boolean> {
  try {
    const { publishableKey, secretKey } = await getCredentials();
    return !!(publishableKey && secretKey);
  } catch {
    return false;
  }
}

export function getStripeEnvironment(): 'production' | 'development' {
  return process.env.REPLIT_DEPLOYMENT === '1' ? 'production' : 'development';
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const stripe = await getStripeClient();
    const secretKey = await getCredentials().then(c => c.secretKey);

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}

interface EnsureCustomerResult {
  customerId: string;
  wasRecreated: boolean;
}

export async function ensureStripeCustomer(
  userId: string,
  email: string,
  currentStripeCustomerId: string | null,
  updateUserFn: (userId: string, data: { stripeCustomerId: string; stripeSubscriptionId?: null }) => Promise<void>
): Promise<EnsureCustomerResult> {
  const stripe = await getStripeClient();
  const environment = getStripeEnvironment();
  
  if (currentStripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(currentStripeCustomerId);
      if (!customer.deleted) {
        return { customerId: currentStripeCustomerId, wasRecreated: false };
      }
    } catch (error: any) {
      if (error?.code !== 'resource_missing') {
        console.error(`Stripe customer validation error for ${currentStripeCustomerId}:`, error?.message);
      }
    }
    console.log(`Stale Stripe customer ${currentStripeCustomerId} detected for user ${userId} in ${environment} environment. Creating new customer.`);
  }
  
  const newCustomer = await stripe.customers.create({
    email: email || `user-${userId}@clerion.app`,
    metadata: { 
      userId,
      environment,
      createdAt: new Date().toISOString(),
    },
  });
  
  await updateUserFn(userId, { 
    stripeCustomerId: newCustomer.id,
    stripeSubscriptionId: null,
  });
  
  console.log(`Created new Stripe customer ${newCustomer.id} for user ${userId} in ${environment} environment.`);
  
  return { customerId: newCustomer.id, wasRecreated: !!currentStripeCustomerId };
}
