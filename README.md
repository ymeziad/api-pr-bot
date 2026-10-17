# Shipfix

**API vendors ship the fix, not just the changelog.** An API provider describes a change ("legacy Charges is deprecated, use PaymentIntents"), and Shipfix opens a tested pull request in every customer repo it affects.

1. **Compile.** The changelog becomes a structured `ChangeSpec` (`src/compiler`, cached specs in `config/specs/`).
2. **Scan.** Find affected call sites in each connected repo (`src/scanner`, repos in `config/repos.json`).
3. **Fix.** Claude Code fixes the repo in a disposable sandbox, then runs typecheck and tests (`src/fixer`).
4. **Gate.** Only fixes that pass the tests without editing them get through.
5. **PR.** Open a GitHub PR that explains the change (`src/pr`).
6. **Dashboard.** Live stage view of every repo (`src/app`).

## Demo repos

| Repo | Charges → PaymentIntents (breaking) | Automatic payment methods (feature) |
|---|---|---|
| [acme-shop](https://github.com/ymeziad/acme-shop) | affected (2 call sites) | unaffected |
| [bookly-api](https://github.com/ymeziad/bookly-api) | affected (1) | affected (1) |
| [notes-app](https://github.com/ymeziad/notes-app) | unaffected | unaffected |

Source lives in `demo-repos/`. Republish with `GITHUB_ORG=ymeziad scripts/publish-demo-repos.sh`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys; never commit
npx tsx scripts/try-pipeline-b.ts --no-pr   # scan all demo repos with the cached spec
npx tsx scripts/reset-demo.ts               # close Shipfix PRs + delete api-pr-bot/* branches
npm run dev                                 # dashboard at http://localhost:3000
```

## Running the demo

The full recording plan is in [docs/demo-script.md](docs/demo-script.md).

- **Real vs mock.** The dashboard uses mocks unless `.env.local` has `USE_MOCKS=false`. Real runs also need `ANTHROPIC_API_KEY`, `FREESTYLE_API_KEY` and a GitHub login with push access to the demo repos (`gh auth login` or `GITHUB_TOKEN`).
- **Reset before every take:** `npx tsx scripts/reset-demo.ts`. It only touches `api-pr-bot/*` branches and their PRs in the three demo repos.
- **Sandbox fallback.** If Freestyle is down, set `SANDBOX=docker` (needs Docker or Colima running locally). Same pipeline, same PRs.
- **Live compile fallback.** Compiling from a URL or text gives up after 30s with a clear error. Click a quick-pick change instead; those load the hand-checked specs in `config/specs/`.
- **bookly-api is hit by both changes.** Running both quick picks gives it two separate PRs (`bookings.ts` for the breaking change, `deposits.ts` for the feature). They touch different files and don't conflict.
- **Rejected path.** Start the dashboard with `FIXER_SABOTAGE=protected-always npm run dev` to force the gate to reject every fix (the agent "edits a test"). Use it to rehearse what a failure looks like; never record with it on.
- **End-to-end without the dashboard:** `npx tsx scripts/try-e2e.ts [spec-id] [repo ...] [--mock]`.

## Ownership

- `src/shared/`: Person C (shared contract; change only with team OK)
- `src/compiler/`, `src/scanner/`, `src/pr/`, `config/`, `scripts/`, `demo-repos/`: Person B
- `src/fixer/`, `scripts/try-fixer.ts`: Person A
- `src/orchestrator/`, `src/app/`: Person C
