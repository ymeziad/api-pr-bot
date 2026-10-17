# Acme Shop

Storefront backend for Acme: cart totals, one-off checkout, and monthly plan renewals, billed through Stripe.

```bash
npm ci
npm run typecheck
npm test
```

- `src/checkout.ts`: charges a cart at checkout
- `src/subscriptions.ts`: renews basic / pro / team plans
- `src/cart.ts`: totals and coupons
