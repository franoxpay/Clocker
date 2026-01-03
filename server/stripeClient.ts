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
