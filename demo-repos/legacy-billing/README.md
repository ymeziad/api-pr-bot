# Legacy Billing

Invoice collection for a long-running billing system, charged through Stripe.

```bash
npm ci
npm run typecheck
npm test
```

- `src/invoices.ts`: collects an invoice with the card on file
- `src/totals.ts`: subtotal and tax
