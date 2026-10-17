import { describe, expect, it, vi } from "vitest";

vi.mock("../src/stripeClient", async () => ({ stripe: (await import("./fakeStripe")).fakeStripe }));

import { checkout } from "../src/checkout";
import { cartTotal } from "../src/cart";
import type { Cart } from "../src/types";

const cart: Cart = {
  currency: "usd",
  items: [
    { sku: "TSHIRT", name: "Acme T-shirt", unitPrice: 2500, quantity: 2 },
    { sku: "MUG", name: "Acme Mug", unitPrice: 1200, quantity: 1 },
  ],
};

describe("checkout", () => {
  it("charges the customer and reports success", async () => {
    const result = await checkout(cart, "cus_123", "pm_card_visa");
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("rejects empty carts", async () => {
    await expect(checkout({ currency: "usd", items: [] }, "cus_123", "pm_card_visa")).rejects.toThrow();
  });

  it("applies coupons to the total", () => {
    expect(cartTotal({ ...cart, couponCode: "WELCOME10" })).toBe(5580);
  });
});
