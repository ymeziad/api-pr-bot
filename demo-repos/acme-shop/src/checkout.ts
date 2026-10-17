import { stripe } from "./stripeClient";
import { cartTotal } from "./cart";
import type { Cart, PaymentOutcome } from "./types";

export async function checkout(
  cart: Cart,
  customerId: string,
  paymentMethodId: string,
): Promise<PaymentOutcome> {
  const amount = cartTotal(cart);
  if (amount <= 0) {
    throw new Error("Cart total must be greater than zero");
  }

  const charge = await stripe.charges.create({
    amount,
    currency: cart.currency,
    customer: customerId,
    source: paymentMethodId,
    description: `Acme Shop order (${cart.items.length} items)`,
  });

  return { ok: charge.paid, id: charge.id };
}
