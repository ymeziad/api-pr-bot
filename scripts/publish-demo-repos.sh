#!/usr/bin/env bash
# Create (if missing) and force-push the three demo repos to $GITHUB_ORG, then write config/repos.json.
# Usage: GITHUB_ORG=my-org scripts/publish-demo-repos.sh
set -euo pipefail
: "${GITHUB_ORG:?set GITHUB_ORG}"
cd "$(dirname "$0")/.."
desc() {
  case "$1" in
    acme-shop) echo "Demo storefront: checkout + subscriptions on Stripe (legacy Charges API)" ;;
    bookly-api) echo "Demo booking API: payments + deposits on Stripe" ;;
    notes-app) echo "Demo notes app: Stripe customers only" ;;
  esac
}
for name in acme-shop bookly-api notes-app; do
  gh repo view "$GITHUB_ORG/$name" >/dev/null 2>&1 || \
    gh repo create "$GITHUB_ORG/$name" --public --description "$(desc "$name")" >/dev/null
  tmp=$(mktemp -d)
  (cd "demo-repos/$name" && tar cf - --exclude node_modules .) | (cd "$tmp" && tar xf -)
  (cd "$tmp" && git init -q -b main && git add -A \
    && git -c user.name="Shipfix Demo" -c user.email=shipfix-bot@users.noreply.github.com commit -qm "Initial commit" \
    && git -c credential.helper= -c credential.helper="!gh auth git-credential" push -q --force "https://github.com/$GITHUB_ORG/$name.git" main)
  rm -rf "$tmp"
  echo "pushed https://github.com/$GITHUB_ORG/$name"
done
node -e '
const org = process.env.GITHUB_ORG;
const repos = ["acme-shop","bookly-api","notes-app"].map(name => ({ owner: org, name, defaultBranch: "main", cloneUrl: `https://github.com/${org}/${name}.git` }));
require("fs").writeFileSync("config/repos.json", JSON.stringify(repos, null, 2) + "\n");'
echo "wrote config/repos.json"
