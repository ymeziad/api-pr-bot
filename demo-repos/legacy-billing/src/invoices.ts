import { stripe } from "./stripeClient";
import { invoiceTotal } from "./totals";
import type { Invoice, PaymentOutcome } from "./types";

export async function payInvoice(invoice: Invoice, paymentMethodId: string): Promise<PaymentOutcome> {
  const amount = invoiceTotal(invoice);
  if (amount <= 0) {
    throw new Error(`Invoice ${invoice.id} has nothing to collect`);
  }

  const charge = await stripe.charges.create({
    amount,
    currency: invoice.currency,
    customer: invoice.customerId,
    source: paymentMethodId,
    description: `Invoice ${invoice.id}`,
  });

  return { ok: charge.paid, id: charge.id };
}
