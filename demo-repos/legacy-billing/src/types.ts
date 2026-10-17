export interface InvoiceLine {
  description: string;
  amount: number; // in cents
}

export interface Invoice {
  id: string;
  customerId: string;
  currency: string;
  lines: InvoiceLine[];
  taxRate: number; // e.g. 0.05 for 5%
}

export interface PaymentOutcome {
  ok: boolean;
  id: string;
}
