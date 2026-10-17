/**
 * Run fixRepo on one repo with a cached spec, without the dashboard.
 *
 *   npx tsx scripts/try-fixer.ts [specId] [repoName|cloneUrl]
 *   npx tsx scripts/try-fixer.ts charges-to-paymentintents acme-shop
 *   SANDBOX=docker npx tsx scripts/try-fixer.ts charges-to-paymentintents https://github.com/org/repo.git
 *
 * Writes the diff to .fixer-out/<repo>.diff for inspection.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangeSpec, Match, RepoTarget, ScanResult } from "@/shared/types";
import { fixRepo } from "@/fixer";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const specId = process.argv[2] ?? "charges-to-paymentintents";
const repoArg = process.argv[3] ?? "acme-shop";

const spec: ChangeSpec = JSON.parse(readFileSync(join("config/specs", `${specId}.json`), "utf8"));

function resolveRepo(arg: string): RepoTarget {
  if (arg.startsWith("/") || arg.startsWith("file://")) {
    // Local git repo (dev): fixRepo ships it into the sandbox as a bundle.
    const path = arg.replace(/^file:\/\//, "");
    return { owner: "local", name: path.split("/").filter(Boolean).pop()!, defaultBranch: process.env.BRANCH ?? "main", cloneUrl: `file://${path}` };
  }
  if (/^https?:\/\//.test(arg)) {
    const [, owner, name] = arg.match(/github\.com\/([^/]+)\/([^/.]+)/) ?? [, "unknown", arg];
    return { owner: owner!, name: name!, defaultBranch: process.env.BRANCH ?? "main", cloneUrl: arg };
  }
  if (existsSync("config/repos.json")) {
    const repos: RepoTarget[] = JSON.parse(readFileSync("config/repos.json", "utf8"));
    const hit = repos.find((r) => r.name === arg);
    if (hit) return hit;
  }
  const org = process.env.GITHUB_ORG;
  if (!org) throw new Error(`repo "${arg}" not in config/repos.json and GITHUB_ORG unset`);
  return { owner: org, name: arg, defaultBranch: "main", cloneUrl: `https://github.com/${org}/${arg}.git` };
}

/** Prefer Person B's scanner; fall back to an empty match list (the agent can still grep). */
async function scan(repo: RepoTarget): Promise<ScanResult> {
  try {
    const mod = await import("@/scanner");
    return await mod.scanRepo(repo, spec);
  } catch (e) {
    console.warn(`[try-fixer] scanner unavailable (${(e as Error).message.split("\n")[0]}); using empty matches`);
    const matches: Match[] = [];
    return { repo, affected: true, matches };
  }
}

async function main() {
  const repo = resolveRepo(repoArg);
  console.log(`[try-fixer] spec=${spec.id} repo=${repo.cloneUrl} sandbox=${process.env.SANDBOX ?? "freestyle"}`);
  const scanResult = await scan(repo);
  console.log(`[try-fixer] ${scanResult.matches.length} scanner match(es)`);

  const t0 = Date.now();
  const result = await fixRepo({
    repo,
    spec,
    scan: scanResult,
    emit: (e) => console.log(`[event] ${e.repo} → ${e.stage}${e.message ? `: ${e.message}` : ""}`),
  });

  mkdirSync(".fixer-out", { recursive: true });
  writeFileSync(`.fixer-out/${repo.name}.diff`, result.diff);
  writeFileSync(`.fixer-out/${repo.name}.json`, JSON.stringify(result, null, 2));

  console.log("\n========== FixResult ==========");
  console.log(`status:        ${result.status}`);
  console.log(`attempts:      ${result.attempts}`);
  console.log(`changedFiles:  ${result.changedFiles.join(", ") || "(none)"}`);
  if (result.rejectionReason) console.log(`reason:        ${result.rejectionReason}`);
  console.log(`elapsed:       ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`diff:          .fixer-out/${repo.name}.diff (${result.diff.split("\n").length} lines)`);
  console.log("\n--- diff ---\n" + result.diff);
  console.log("--- test output (tail) ---\n" + result.testOutput.split("\n").slice(-15).join("\n"));
  process.exit(result.status === "passed" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
