import { describe, expect, it, vi } from "vitest";

vi.mock("../src/stripeClient", async () => ({ stripe: (await import("./fakeStripe")).fakeStripe }));

import { createBillingCustomer } from "../src/billing";

describe("billing", () => {
  it("creates a Stripe customer for a new user", async () => {
    const result = await createBillingCustomer({ id: "u1", email: "ada@example.com", name: "Ada" });
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
  });
});
