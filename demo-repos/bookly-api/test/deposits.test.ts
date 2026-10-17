import { describe, expect, it, vi } from "vitest";

vi.mock("../src/stripeClient", async () => ({ stripe: (await import("./fakeStripe")).fakeStripe }));

import { takeDeposit } from "../src/deposits";
import { depositAmount } from "../src/pricing";
import type { Booking } from "../src/types";

const booking: Booking = {
  id: "bk_2",
  serviceId: "consult",
  customerId: "cus_123",
  startsAt: "2026-11-02T15:00:00Z",
  durationMinutes: 60,
};

describe("deposits", () => {
  it("collects a 20% deposit", async () => {
    const result = await takeDeposit(booking, "pm_card_visa");
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("computes the deposit amount", () => {
    expect(depositAmount(booking)).toBe(3000);
  });
});
