import Stripe from 'stripe';

function getDatabaseUrl(): string {
  if (process.env.EXTERNAL_DATABASE_URL) return process.env.EXTERNAL_DATABASE_URL;
  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER) {
    const { PGUSER, PGPASSWORD = '', PGHOST, PGPORT = '5432', PGDATABASE } = process.env;
    return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error('No database URL found for Stripe sync');
}

async function getConnectorCredentials(): Promise<{ publishableKey: string; secretKey: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) return null;

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  try {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', 'stripe');
    url.searchParams.set('environment', targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken },
    });

    const data = await response.json();
    const settings = data.items?.[0]?.settings;

    if (settings?.publishable && settings?.secret) {
      return { publishableKey: settings.publishable, secretKey: settings.secret };
    }
  } catch (err: any) {
    console.warn('[Stripe] Failed to fetch connector credentials:', err.message);
  }
  return null;
}

async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  // Priority 1: explicit env vars set by user (most trustworthy)
  const envSecret = process.env.STRIPE_SECRET_KEY;
  const envPublishable = process.env.STRIPE_PUBLISHABLE_KEY;
  if (envSecret && envPublishable) {
    return { secretKey: envSecret, publishableKey: envPublishable };
  }

  // Priority 2: Replit connector
  const connector = await getConnectorCredentials();
  if (connector) return connector;

  // Priority 3: partial env vars
  return {
    secretKey: envSecret || '',
    publishableKey: envPublishable || '',
  };
}

// No singleton — always create fresh client to pick up key changes
export async function getStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  if (!secretKey) {
    throw new Error('[Stripe] Secret key not found. Set STRIPE_SECRET_KEY in environment secrets.');
  }
  return new Stripe(secretKey);
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  if (!publishableKey) {
    throw new Error('[Stripe] Publishable key not found. Set STRIPE_PUBLISHABLE_KEY in environment secrets.');
  }
  return publishableKey;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
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

export async function validateStripeConfig(): Promise<void> {
  console.log('[Stripe] Validating configuration...');
  const configured = await isStripeConfigured();
  if (!configured) {
    console.error('[Stripe] CRITICAL: No Stripe keys found. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in secrets.');
    return;
  }

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    console.warn('[Stripe] WARNING: STRIPE_WEBHOOK_SECRET not set — webhook signature validation will be skipped.');
  } else {
    console.log('[Stripe] Webhook secret: configured');
  }

  try {
    const stripe = await getStripeClient();
    await stripe.accounts.retrieve();
    console.log('[Stripe] Connection test: OK');
  } catch (err: any) {
    if (err?.code === 'api_key_expired' || err?.type === 'StripeAuthenticationError') {
      console.error('[Stripe] CRITICAL: API key is expired or invalid. Update STRIPE_SECRET_KEY in secrets.');
    } else {
      console.warn('[Stripe] Connection test warning:', err.message);
    }
  }
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const { secretKey } = await getCredentials();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: getDatabaseUrl(),
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}

export function resetStripeSync() {
  stripeSync = null;
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
        console.error(`[Stripe] Customer validation error for ${currentStripeCustomerId}:`, error?.message);
      }
    }
    console.log(`[Stripe] Stale customer ${currentStripeCustomerId} detected for user ${userId}. Creating new one.`);
  }

  const newCustomer = await stripe.customers.create({
    email: email || `user-${userId}@clerion.app`,
    metadata: { userId, environment, createdAt: new Date().toISOString() },
  });

  await updateUserFn(userId, {
    stripeCustomerId: newCustomer.id,
    stripeSubscriptionId: null,
  });

  console.log(`[Stripe] Created customer ${newCustomer.id} for user ${userId} (${environment})`);
  return { customerId: newCustomer.id, wasRecreated: !!currentStripeCustomerId };
}
