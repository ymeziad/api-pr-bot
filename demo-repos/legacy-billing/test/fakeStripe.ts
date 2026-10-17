import { vi } from "vitest";

// In-memory stand-in for the Stripe client. The spies let tests assert exactly
// which Stripe call the billing code makes.
export const fakeStripe = {
  charges: {
    create: vi.fn(async (_params: Record<string, unknown>) => ({ id: "ch_123", paid: true, status: "succeeded" })),
  },
  paymentIntents: {
    create: vi.fn(async (params: Record<string, unknown>) => ({
      id: "pi_123",
      status: params.confirm ? "succeeded" : "requires_confirmation",
    })),
    confirm: vi.fn(async (id: string, _params?: Record<string, unknown>) => ({ id, status: "succeeded" })),
  },
  customers: {
    create: vi.fn(async (_params: Record<string, unknown>) => ({ id: "cus_123" })),
  },
};
