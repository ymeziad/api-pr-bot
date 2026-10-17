# Shipfix: 90-second demo video

One change → **4 repos checked → 2 tested PRs → 1 left alone → 1 rejected by the safety gate**.

A real run takes about **28 seconds** to both PRs open (VM boot <1s, Claude Code ~20s, tests ~4s, PR ~3s) and about **51 seconds** until legacy-billing is rejected (it gets a second attempt before the gate gives up). Fitting the whole run into the 25-second pipeline shot takes **~2x**. Alternatively, play the first 28s at ~1.1x, then cut to the rejected row.

## Script and shot list

| Time | Shot | On screen | Voiceover |
| --- | --- | --- | --- |
| 0–10s | **A.** Stripe Charges → PaymentIntents migration doc, then cut to the Shipfix dashboard header (beams animating) | docs.stripe.com page, then "API vendors ship the fix, not just the changelog." | "When Stripe changes an API, it posts a changelog and hopes developers read it. Most don't." |
| 10–25s | **B.** Click **Charges → PaymentIntents (breaking)**. Summary card fades in. Hover the search-pattern chips, then the migration steps | Red **Breaking** badge, "Migrate from the legacy Charges API to PaymentIntents", `stripe\.charges\.create\(` chips, 5 numbered steps | "Shipfix turns the changelog into structured instructions: what changed, what code to look for, and how to migrate." |
| 25–50s | **C.** Click **Run on connected repos**. Table appears. notes-app flips to **Not affected: skipped** in under a second; acme-shop and bookly-api go Scan → Fix → Test → PR; legacy-billing goes Scan → Fix → Test → retry → **Rejected**. End on the two green **View PR →** buttons and the red Rejected row | file:line chips (`src/checkout.ts:15`, `src/subscriptions.ts:21`, `src/bookings.ts:6`, `src/invoices.ts:11`), live timers, row messages "Claude Code is fixing it in a sandbox VM" → "Running typecheck + tests" | "It scans every connected customer repo. Repos that don't use the old API get nothing. Affected ones get fixed by Claude Code inside a throwaway sandbox VM, then type-checked and tested." |
| 50–75s | **D.** Click **View PR →** on acme-shop. GitHub PR: scroll title → "Why this repo is affected" (file:line links) → Files changed diff → Verification section | `[Stripe] Migrate from the legacy Charges API to PaymentIntents`, `charges.create` → `paymentIntents.create` diff, passing test output | "Only fixes that pass the tests, without touching the tests, become pull requests. Here's one: what changed, why this repo, the fix, and proof it works." |
| 75–85s | **E.** Back to dashboard; footer ticks to **4 repos checked · 2 PRs opened · 1 not affected · 1 rejected**. Hold on the legacy-billing **Rejected: tests failed** row | Footer numbers, red Rejected row | "One repo's tests were pinned to the old API. A correct fix would mean changing the tests, and Shipfix never edits tests, so it flags it for a human instead. And a human always decides whether to merge." |
| 85–90s | **F.** End card: Shipfix logo + tagline on dark background | "Shipfix · API vendors ship the fix, not just the changelog." | "Stripe stops asking developers to migrate. It ships the fix itself." |

**Voiceover word count:** ~150 words, a comfortable pace for 90s. Record the voiceover separately and lay it over the clips. Don't narrate live during the screen recording.

## Clips to record (separately, then cut together)

1. **Dashboard run (shots B, C, E):** one continuous take from a fresh page load through the footer summary, including the legacy-billing rejection. Record 2–3 takes; keep the cleanest.
2. **PR walkthrough (shot D):** open the acme-shop PR in the same browser and scroll slowly: description → affected lines → Files changed → Verification.
3. **Stripe docs (shot A):** 3–4s scroll of https://docs.stripe.com/payments/payment-intents/migration/charges.
4. **End card (shot F):** screenshot the dashboard header with the input section scrolled away, or build it in the editor.

## Before every take

```bash
npm run reset-demo        # closes all api-pr-bot/* PRs and deletes the branches (all 4 repos)
```

Then:
- Confirm `.env.local` has `USE_MOCKS=false` for real takes.
- Restart the dev server if you changed `.env.local` (Ctrl+C, then `npm run dev`).
- Hard-refresh the dashboard (Cmd+Shift+R) so it starts on the empty input state.
- Check the GitHub PR list for acme-shop and bookly-api is empty, so the new PR numbers aren't confusing.
- Check `.env.local` does **not** set `FIXER_SABOTAGE`. The rejection must be the real one.

Each real 4-repo run costs about **$0.35** in Claude usage (measured: $0.33 over 4 Claude calls; the rejected repo uses 2 attempts, $0.14–0.28 of that). Budget about $4 for ~10 takes.

## The rejected repo (shot E)

`legacy-billing` calls `stripe.charges.create`, so the scanner flags it. Its test asserts the Charges call itself (`expect(charges.create).toHaveBeenCalledWith(...)`), not just the business outcome. Claude makes the correct migration, the pinned test fails, Claude refuses to edit the test, and after a second attempt the gate rejects it with **tests failed**. This isn't staged: it was verified 4/4 times with the real fixer (each about 45s, always `rejected: tests failed`). No PR is opened for it.

## Recording settings

- **Resolution:** 1920×1080. **Browser zoom:** 110–125% so table text stays readable after compression.
- **Clean browser:** hide the bookmarks bar, close other tabs, use a fresh window, and turn on Do Not Disturb.
- **Recorder:** macOS Cmd+Shift+5 → Record Selected Portion, or QuickTime. Hide the Next.js dev indicator (the round "N" badge, bottom-left) by cropping, or record a production build: `npm run build && npm start`.
- **Editing:** CapCut, iMovie or Descript. Cut the dashboard and PR clips together, add burned-in captions, and keep music low or skip it.
- **Speed-ups:** if you speed up shot C, put a small **"1.3x"** label on screen for the whole sped-up section. Never hide a speed-up.
- **Export:** ≤ 90 seconds, 1080p, H.264 MP4.

## Fallback

If the real pipeline breaks on recording day, set `USE_MOCKS=true` and record the same shots. The mock run looks the same (including a retry on bookly-api) but takes ~25s and links to fake PR URLs. For shot D, use a real PR from an earlier successful run instead of clicking through. If you end up using mock footage, say so in the submission.

## Timeline checkpoints

| Time | Goal |
| --- | --- |
| T+2:30 | Backup recording: one full real run (clips 1 + 2), even if rough |
| T+3:00 | Feature freeze, bug fixes only |
| T+3:00–3:30 | 3 timed dry runs with `reset-demo` between each; confirm the speed-up factor |
| T+3:30–4:15 | Final clips 1–5 |
| T+4:15–4:50 | Edit, voiceover, captions, export |
| T+4:50–5:00 | Submit |
