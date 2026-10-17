# Bookly API

Appointment booking backend: per-minute service pricing, full payment for bookings, and 20% deposits, billed through Stripe.

```bash
npm ci
npm run typecheck
npm test
```

- `src/bookings.ts`: charges the full booking price
- `src/deposits.ts`: collects a deposit with a PaymentIntent
- `src/pricing.ts`: hourly rates and deposit math
