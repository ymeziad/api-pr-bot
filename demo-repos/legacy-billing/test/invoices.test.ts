import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/stripeClient", async () => ({ stripe: (await import("./fakeStripe")).fakeStripe }));

import { fakeStripe } from "./fakeStripe";
import { payInvoice } from "../src/invoices";
import { invoiceTotal } from "../src/totals";
import type { Invoice } from "../src/types";

const invoice: Invoice = {
  id: "inv_1001",
  customerId: "cus_123",
  currency: "usd",
  taxRate: 0.05,
  lines: [{ description: "Consulting, 1 hour", amount: 4000 }],
};

describe("payInvoice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("collects the invoice and reports success", async () => {
    const result = await payInvoice(invoice, "pm_card_visa");
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("charges the card on file for the invoice total", async () => {
    await payInvoice(invoice, "pm_card_visa");
    expect(fakeStripe.charges.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: "pm_card_visa", amount: 4200, customer: "cus_123" }),
    );
  });

  it("refuses empty invoices", async () => {
    await expect(payInvoice({ ...invoice, lines: [] }, "pm_card_visa")).rejects.toThrow();
  });

  it("adds tax to the total", () => {
    expect(invoiceTotal(invoice)).toBe(4200);
  });
});
