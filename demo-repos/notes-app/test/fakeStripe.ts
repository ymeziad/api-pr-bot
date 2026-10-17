// In-memory stand-in for the Stripe client. Tests only check business
// outcomes, so any correct Stripe API usage passes.
export const fakeStripe = {
  charges: {
    create: async (_params: Record<string, unknown>) => ({ id: "ch_123", paid: true, status: "succeeded" }),
  },
  paymentIntents: {
    create: async (params: Record<string, unknown>) => ({
      id: "pi_123",
      status: params.confirm ? "succeeded" : "requires_confirmation",
    }),
    confirm: async (id: string, _params?: Record<string, unknown>) => ({ id, status: "succeeded" }),
  },
  customers: {
    create: async (_params: Record<string, unknown>) => ({ id: "cus_123" }),
  },
};
