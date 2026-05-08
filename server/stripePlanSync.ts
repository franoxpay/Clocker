import { db } from "./db";
import { plans } from "@shared/schema";
import { eq, ne } from "drizzle-orm";
import { getStripeClient, isStripeConfigured } from "./stripeClient";
import type Stripe from "stripe";

export interface PlanSyncResult {
  planId: number;
  planName: string;
  status: "linked" | "created" | "reused" | "error";
  stripeProductId?: string;
  stripePriceId?: string;
  action: string;
  error?: string;
}

export interface SyncSummary {
  total: number;
  created: number;
  reused: number;
  linked: number;
  errors: number;
  results: PlanSyncResult[];
}

async function findOrCreateProduct(stripe: Stripe, name: string): Promise<{ id: string; wasCreated: boolean }> {
  const existing = await stripe.products.search({
    query: `active:'true' AND name:'${name.replace(/'/g, "\\'")}'`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    console.log(`[StripePlanSync] Product reutilizado: "${name}" → ${existing.data[0].id}`);
    return { id: existing.data[0].id, wasCreated: false };
  }

  const created = await stripe.products.create({ name });
  console.log(`[StripePlanSync] Product criado: "${name}" → ${created.id}`);
  return { id: created.id, wasCreated: true };
}

async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  unitAmount: number,
): Promise<{ id: string; wasCreated: boolean }> {
  const existing = await stripe.prices.list({
    product: productId,
    currency: "brl",
    active: true,
    recurring: { interval: "month" } as any,
    limit: 100,
  });

  const match = existing.data.find(
    (p) =>
      p.unit_amount === unitAmount &&
      p.recurring?.interval === "month" &&
      p.currency === "brl" &&
      p.active,
  );

  if (match) {
    console.log(`[StripePlanSync] Price reutilizado: ${unitAmount} BRL/mês → ${match.id}`);
    return { id: match.id, wasCreated: false };
  }

  const created = await stripe.prices.create({
    product: productId,
    currency: "brl",
    unit_amount: unitAmount,
    recurring: { interval: "month" },
  });
  console.log(`[StripePlanSync] Price criado: ${unitAmount} BRL/mês → ${created.id}`);
  return { id: created.id, wasCreated: true };
}

async function validateExistingPrice(stripe: Stripe, priceId: string): Promise<boolean> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    return price.active === true;
  } catch {
    return false;
  }
}

export async function syncPlansToStripe(): Promise<SyncSummary> {
  console.log("[StripePlanSync] Sincronização iniciada");

  if (!isStripeConfigured()) {
    throw new Error("Stripe não está configurado — STRIPE_SECRET_KEY ausente");
  }

  const stripe = await getStripeClient();

  const allPlans = await db
    .select()
    .from(plans)
    .where(eq(plans.isFree, false));

  console.log(`[StripePlanSync] ${allPlans.length} planos pagos encontrados no banco`);

  const results: PlanSyncResult[] = [];

  for (const plan of allPlans) {
    const result: PlanSyncResult = {
      planId: plan.id,
      planName: plan.name,
      status: "error",
      action: "",
    };

    try {
      // Step 1 — if we already have a priceId, validate it
      if (plan.stripePriceId) {
        const valid = await validateExistingPrice(stripe, plan.stripePriceId);
        if (valid) {
          result.status = "linked";
          result.stripePriceId = plan.stripePriceId;
          result.stripeProductId = plan.stripeProductId ?? undefined;
          result.action = `Price ${plan.stripePriceId} já existe e está ativo na Stripe`;
          console.log(`[StripePlanSync] Plano "${plan.name}" já vinculado → ${plan.stripePriceId}`);
          results.push(result);
          continue;
        }
        console.log(`[StripePlanSync] Price ${plan.stripePriceId} inativo/inexistente — recriando`);
      }

      // Step 2 — find or create Product
      const { id: productId, wasCreated: productCreated } = await findOrCreateProduct(stripe, plan.name);

      // Step 3 — find or create Price
      const { id: priceId, wasCreated: priceCreated } = await findOrCreatePrice(stripe, productId, plan.price);

      // Step 4 — save to DB (direct update to avoid name-uniqueness guard in storage.updatePlan)
      await db
        .update(plans)
        .set({ stripeProductId: productId, stripePriceId: priceId, updatedAt: new Date() })
        .where(eq(plans.id, plan.id));

      const actions: string[] = [];
      if (productCreated) actions.push("Product criado");
      else actions.push("Product reutilizado");
      if (priceCreated) actions.push("Price criado");
      else actions.push("Price reutilizado");
      actions.push("Plano vinculado");

      result.status = productCreated || priceCreated ? "created" : "reused";
      result.stripeProductId = productId;
      result.stripePriceId = priceId;
      result.action = actions.join("; ");

      console.log(`[StripePlanSync] Plano "${plan.name}" → product=${productId} price=${priceId}`);
    } catch (err: any) {
      result.status = "error";
      result.error = err.message;
      result.action = `Erro: ${err.message}`;
      console.error(`[StripePlanSync] Erro no plano "${plan.name}":`, err.message);
    }

    results.push(result);
  }

  const summary: SyncSummary = {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    reused: results.filter((r) => r.status === "reused").length,
    linked: results.filter((r) => r.status === "linked").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  };

  console.log(
    `[StripePlanSync] Concluído — criados: ${summary.created}, reutilizados: ${summary.reused}, já vinculados: ${summary.linked}, erros: ${summary.errors}`,
  );

  return summary;
}
