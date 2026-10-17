// Person B smoke test: cached spec -> scan all repos -> open real PRs using the hand-verified fixtures.
// Usage: npx tsx scripts/try-pipeline-b.ts [spec-id ...] [--no-pr]
//   no spec ids = both demo specs
import "../src/lib/env";
import { loadCachedSpec } from "../src/compiler";
import { openPullRequest } from "../src/pr";
import { loadFixtureFix } from "../src/pr/fixtures";
import { scanRepo } from "../src/scanner";
import { loadRepos } from "../src/scanner/repos";

const args = process.argv.slice(2);
const openPr = !args.includes("--no-pr");
const specIds = args.filter((a) => !a.startsWith("--"));
const specs = (specIds.length ? specIds : ["charges-to-paymentintents", "payment-intents-automatic-payment-methods"]).map(
  loadCachedSpec,
);
const repos = loadRepos();

for (const spec of specs) {
  console.log(`\n== ${spec.id} (${spec.type})`);
  const scans = await Promise.all(repos.map((repo) => scanRepo(repo, spec)));
  for (const scan of scans) {
    console.log(`${scan.repo.name}: ${scan.affected ? `AFFECTED, ${scan.matches.length} match(es)` : "unaffected"}`);
    for (const m of scan.matches) console.log(`   ${m.file}:${m.line}  ${m.text}`);
  }
  if (!openPr) continue;
  for (const scan of scans.filter((s) => s.affected)) {
    const fix = loadFixtureFix(scan.repo.name, spec.id);
    if (!fix) {
      console.log(`   (no fixture for ${scan.repo.name}, skipping PR)`);
      continue;
    }
    console.log(`   PR ${scan.repo.name}: ${await openPullRequest({ repo: scan.repo, spec, scan, fix })}`);
  }
}
