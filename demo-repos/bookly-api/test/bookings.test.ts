import { describe, expect, it, vi } from "vitest";

vi.mock("../src/stripeClient", async () => ({ stripe: (await import("./fakeStripe")).fakeStripe }));

import { payForBooking } from "../src/bookings";
import { bookingPrice } from "../src/pricing";
import type { Booking } from "../src/types";

const booking: Booking = {
  id: "bk_1",
  serviceId: "massage",
  customerId: "cus_123",
  startsAt: "2026-11-01T10:00:00Z",
  durationMinutes: 90,
};

describe("bookings", () => {
  it("takes full payment for a booking", async () => {
    const result = await payForBooking(booking, "pm_card_visa");
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("prices by duration", () => {
    expect(bookingPrice(booking)).toBe(13500);
  });
});
