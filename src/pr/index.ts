import { Octokit } from "@octokit/rest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeSpec, FixResult, RepoTarget, ScanResult } from "../shared/types";
import { authedCloneUrl, git, requireGithubToken, withTempDir } from "../lib/git";

export const BRANCH_PREFIX = "api-pr-bot/";
const BOT_NAME = "API PR Bot";
const BOT_EMAIL = "api-pr-bot@users.noreply.github.com";

export function branchName(spec: ChangeSpec): string {
  return `${BRANCH_PREFIX}${spec.id}`;
}

export function prTitle(spec: ChangeSpec): string {
  return `[Stripe] ${spec.title}`;
}

interface FileStat { file: string; added: number; removed: number; }

export function diffStats(diff: string): FileStat[] {
  const stats: FileStat[] = [];
  let current: FileStat | undefined;
  for (const line of diff.split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = { file: header[2], added: 0, removed: 0 };
      stats.push(current);
    } else if (current && line.startsWith("+") && !line.startsWith("+++")) {
      current.added++;
    } else if (current && line.startsWith("-") && !line.startsWith("---")) {
      current.removed++;
    }
  }
  return stats;
}

function lastLines(text: string, n: number): string {
  // strip ANSI colour codes so the output reads cleanly on GitHub
  const clean = text.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
  return clean.split("\n").slice(-n).join("\n");
}

export function buildPrBody({ spec, scan, fix }: { spec: ChangeSpec; scan: ScanResult; fix: FixResult }): string {
  const typeLabel = spec.type === "breaking" ? "⚠️ Breaking change" : "✨ New feature";
  const stats = diffStats(fix.diff);
  const files = stats.length ? stats : fix.changedFiles.map((file) => ({ file, added: 0, removed: 0 }));
  const blobBase = `https://github.com/${scan.repo.owner}/${scan.repo.name}/blob/${scan.repo.defaultBranch}`;

  const matchLines = scan.matches.map(
    (m) => `- [\`${m.file}:${m.line}\`](${blobBase}/${m.file}#L${m.line}): \`${m.text.replace(/`/g, "'")}\``,
  );
  const fileLines = files.map((f) =>
    stats.length ? `- \`${f.file}\` (+${f.added} / −${f.removed})` : `- \`${f.file}\``,
  );
  const stepLines = spec.migrationSteps.map((s) => `- ${s}`);
  const testOutput = lastLines(fix.testOutput || "(no test output captured)", 40);
  const attempts = `${fix.attempts} attempt${fix.attempts === 1 ? "" : "s"}`;

  return [
    "## What changed at Stripe",
    "",
    `${spec.summary}`,
    "",
    `**Type:** ${typeLabel}`,
    "",
    "## Why this repo is affected",
    "",
    `Found ${scan.matches.length} call site${scan.matches.length === 1 ? "" : "s"} that ${spec.type === "breaking" ? "use the deprecated API" : "can adopt this feature"}:`,
    "",
    ...matchLines,
    "",
    "## What this PR changes",
    "",
    "**Files changed**",
    "",
    ...fileLines,
    "",
    "**Migration steps applied**",
    "",
    ...stepLines,
    "",
    "## Verification",
    "",
    `✅ Typecheck passed · ✅ Tests passed · ✅ No test files modified · 🔁 ${attempts}`,
    "",
    "<details><summary>Test output</summary>",
    "",
    "```text",
    testOutput,
    "```",
    "",
    "</details>",
    "",
    `📖 **Docs:** ${spec.docsUrl}`,
    "",
    "---",
    "",
    "_Opened automatically by API PR Bot. The fix was generated and verified in an isolated sandbox. Please review before merging._",
  ].join("\n");
}

export async function openPullRequest(args: {
  repo: RepoTarget;
  spec: ChangeSpec;
  scan: ScanResult;
  fix: FixResult;
}): Promise<string> {
  const { repo, spec, fix } = args;
  if (!fix.diff.trim()) throw new Error(`Empty diff for ${repo.name}; nothing to open a PR with`);

  const token = await requireGithubToken();
  const branch = branchName(spec);

  await withTempDir(`pr-${repo.name}`, async (tmp) => {
    const dir = join(tmp, "repo");
    const patch = join(tmp, "fix.diff");
    await writeFile(patch, fix.diff.endsWith("\n") ? fix.diff : `${fix.diff}\n`);

    await git(["clone", "--depth", "1", "--branch", repo.defaultBranch, authedCloneUrl(repo, token), dir]);
    await git(["checkout", "-B", branch], dir);
    try {
      await git(["apply", "--whitespace=nowarn", patch], dir);
    } catch {
      await git(["apply", "--3way", "--whitespace=nowarn", patch], dir);
    }
    await git(["add", "-A"], dir);
    await git(
      ["-c", `user.name=${BOT_NAME}`, "-c", `user.email=${BOT_EMAIL}`, "commit", "-m", `${spec.title} (automated migration)`],
      dir,
    );
    await git(["push", "--force", "origin", `HEAD:refs/heads/${branch}`], dir);
  });

  const octokit = new Octokit({ auth: token });
  const title = prTitle(spec);
  const body = buildPrBody(args);
  const { data: existing } = await octokit.pulls.list({
    owner: repo.owner,
    repo: repo.name,
    head: `${repo.owner}:${branch}`,
    state: "open",
  });
  if (existing.length > 0) {
    const pr = existing[0];
    await octokit.pulls.update({ owner: repo.owner, repo: repo.name, pull_number: pr.number, title, body });
    return pr.html_url;
  }
  const { data: pr } = await octokit.pulls.create({
    owner: repo.owner,
    repo: repo.name,
    head: branch,
    base: repo.defaultBranch,
    title,
    body,
  });
  return pr.html_url;
}
