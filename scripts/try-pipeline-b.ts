// Person B smoke test: cached spec -> scan all repos -> open a real PR on acme-shop with a hand-made fix.
// Usage: npx tsx scripts/try-pipeline-b.ts [spec-id] [--no-pr]
import "../src/lib/env";
import { readFileSync } from "node:fs";
import { loadCachedSpec } from "../src/compiler";
import { openPullRequest } from "../src/pr";
import { scanRepo } from "../src/scanner";
import { loadRepos } from "../src/scanner/repos";
import type { FixResult } from "../src/shared/types";

const specId = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "charges-to-paymentintents";
const openPr = !process.argv.includes("--no-pr");

const spec = loadCachedSpec(specId);
console.log(`Spec: ${spec.id} (${spec.type})\n`);

const scans = await Promise.all(loadRepos().map((repo) => scanRepo(repo, spec)));
for (const scan of scans) {
  console.log(`${scan.repo.name}: ${scan.affected ? `AFFECTED, ${scan.matches.length} match(es)` : "unaffected"}`);
  for (const m of scan.matches) console.log(`   ${m.file}:${m.line}  ${m.text}`);
}

const acme = scans.find((s) => s.repo.name === "acme-shop");
if (!openPr || spec.id !== "charges-to-paymentintents" || !acme?.affected) process.exit(0);

const fix: FixResult = {
  status: "passed",
  diff: readFileSync("scripts/fixtures/acme-shop-fix.diff", "utf8"),
  changedFiles: ["src/checkout.ts", "src/subscriptions.ts"],
  typecheckOutput: "",
  testOutput: readFileSync("scripts/fixtures/acme-shop-test-output.txt", "utf8"),
  attempts: 1,
};
console.log("\nOpening PR on acme-shop...");
console.log(await openPullRequest({ repo: acme.repo, spec, scan: acme, fix }));
