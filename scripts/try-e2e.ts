// Integration #1 without the dashboard: scan -> fixRepo -> gate -> openPullRequest.
// Usage: npx tsx scripts/try-e2e.ts [spec-id] [repo-name ...] [--mock]
//   --mock uses the hand-verified fixtures instead of the sandbox (no Anthropic/Freestyle keys needed)
import "../src/lib/env";
import { loadCachedSpec } from "../src/compiler";
import { fixRepo } from "../src/fixer";
import { openPullRequest } from "../src/pr";
import { loadFixtureFix } from "../src/pr/fixtures";
import { scanRepo } from "../src/scanner";
import { loadRepos } from "../src/scanner/repos";
import type { Emit, FixResult } from "../src/shared/types";

const args = process.argv.slice(2);
const mock = args.includes("--mock") || process.env.USE_MOCKS === "true";
const [specId = "charges-to-paymentintents", ...names] = args.filter((a) => !a.startsWith("--"));
const spec = loadCachedSpec(specId);
const repos = loadRepos().filter((r) => names.length === 0 || names.includes(r.name));

const started = Date.now();
const emit: Emit = (e) =>
  console.log(`[${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s] ${e.repo.padEnd(10)} ${e.stage}${e.message ? `: ${e.message}` : ""}`);

console.log(`Spec ${spec.id} (${spec.type}) · ${mock ? "MOCK fixer (fixtures)" : `real fixer (SANDBOX=${process.env.SANDBOX ?? "freestyle"})`}\n`);

await Promise.all(
  repos.map(async (repo) => {
    try {
      emit({ repo: repo.name, stage: "scanning" });
      const scan = await scanRepo(repo, spec);
      if (!scan.affected) return emit({ repo: repo.name, stage: "unaffected" });
      emit({ repo: repo.name, stage: "affected", message: scan.matches.map((m) => `${m.file}:${m.line}`).join(", ") });

      let fix: FixResult;
      if (mock) {
        emit({ repo: repo.name, stage: "fixing" });
        const fixture = loadFixtureFix(repo.name, spec.id);
        if (!fixture) throw new Error(`no fixture for ${repo.name}--${spec.id}`);
        fix = fixture;
        emit({ repo: repo.name, stage: "passed" });
      } else {
        fix = await fixRepo({ repo, spec, scan, emit });
      }
      if (fix.status !== "passed") return; // fixRepo already emitted rejected/error
      const prUrl = await openPullRequest({ repo, spec, scan, fix });
      emit({ repo: repo.name, stage: "pr_opened", message: prUrl });
    } catch (err) {
      emit({ repo: repo.name, stage: "error", message: (err as Error).message });
    }
  }),
);
