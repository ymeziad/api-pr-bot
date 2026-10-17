# Notes App

A small note-taking backend. Users get a Stripe customer record on signup for future billing.

```bash
npm ci
npm run typecheck
npm test
```

- `src/notes.ts`: in-memory note store
- `src/billing.ts`: creates the Stripe customer
