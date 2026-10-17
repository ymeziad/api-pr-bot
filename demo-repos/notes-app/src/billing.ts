import { stripe } from "./stripeClient";
import type { BillingOutcome, User } from "./types";

export async function createBillingCustomer(user: User): Promise<BillingOutcome> {
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });

  return { ok: true, id: customer.id };
}
