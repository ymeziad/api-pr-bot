import { stripe } from "./stripeClient";
import type { PaymentOutcome } from "./types";

export type Plan = "basic" | "pro" | "team";

const PLAN_PRICES: Record<Plan, number> = {
  basic: 900,
  pro: 2900,
  team: 9900,
};

export function planPrice(plan: Plan): number {
  return PLAN_PRICES[plan];
}

export async function renewSubscription(
  plan: Plan,
  customerId: string,
  paymentMethodId: string,
): Promise<PaymentOutcome> {
  const charge = await stripe.charges.create({
    amount: planPrice(plan),
    currency: "usd",
    customer: customerId,
    source: paymentMethodId,
    description: `Acme ${plan} plan renewal`,
    metadata: { plan },
  });

  return { ok: charge.paid, id: charge.id };
}
