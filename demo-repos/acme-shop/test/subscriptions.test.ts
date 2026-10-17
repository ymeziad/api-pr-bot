import { describe, expect, it, vi } from "vitest";

vi.mock("../src/stripeClient", async () => ({ stripe: (await import("./fakeStripe")).fakeStripe }));

import { planPrice, renewSubscription } from "../src/subscriptions";

describe("subscriptions", () => {
  it("renews a plan and reports success", async () => {
    const result = await renewSubscription("pro", "cus_123", "pm_card_visa");
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("prices plans correctly", () => {
    expect(planPrice("team")).toBe(9900);
  });
});
