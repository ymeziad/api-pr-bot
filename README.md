# API PR Bot

An API provider describes a change ("legacy Charges is deprecated, use PaymentIntents"), and API PR Bot opens a tested pull request in every customer repo it affects.

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
npx tsx scripts/reset-demo.ts               # close bot PRs + delete api-pr-bot/* branches
npm run dev                                 # dashboard at http://localhost:3000 (USE_MOCKS=true runs on fake data, no keys)
```

## Ownership

- `src/shared/`: Person C (shared contract; change only with team OK)
- `src/compiler/`, `src/scanner/`, `src/pr/`, `config/`, `scripts/`, `demo-repos/`: Person B
- `src/fixer/`, `scripts/try-fixer.ts`: Person A
- `src/orchestrator/`, `src/app/`: Person C
