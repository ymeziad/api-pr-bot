import { stripe } from "./stripeClient";
import { bookingPrice } from "./pricing";
import type { Booking, PaymentOutcome } from "./types";

export async function payForBooking(booking: Booking, paymentMethodId: string): Promise<PaymentOutcome> {
  const charge = await stripe.charges.create({
    amount: bookingPrice(booking),
    currency: "usd",
    customer: booking.customerId,
    source: paymentMethodId,
    description: `Bookly ${booking.serviceId} on ${booking.startsAt}`,
    metadata: { bookingId: booking.id },
  });

  return { ok: charge.paid, id: charge.id };
}
