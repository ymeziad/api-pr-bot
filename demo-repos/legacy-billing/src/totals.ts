import type { Invoice } from "./types";

export function invoiceSubtotal(invoice: Invoice): number {
  return invoice.lines.reduce((sum, line) => sum + line.amount, 0);
}

export function invoiceTotal(invoice: Invoice): number {
  return Math.round(invoiceSubtotal(invoice) * (1 + invoice.taxRate));
}
