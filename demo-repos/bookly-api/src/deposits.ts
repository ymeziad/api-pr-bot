import { stripe } from "./stripeClient";
import { depositAmount } from "./pricing";
import type { Booking, PaymentOutcome } from "./types";

export async function takeDeposit(booking: Booking, paymentMethodId: string): Promise<PaymentOutcome> {
  const intent = await stripe.paymentIntents.create({
    amount: depositAmount(booking),
    currency: "usd",
    customer: booking.customerId,
    payment_method: paymentMethodId,
    description: `Bookly deposit for booking ${booking.id}`,
    metadata: { bookingId: booking.id, kind: "deposit" },
  });

  const confirmed = await stripe.paymentIntents.confirm(intent.id);
  return { ok: confirmed.status === "succeeded", id: confirmed.id };
}
