import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { ChangeSpec, Match, RepoTarget, ScanResult } from "../shared/types";
import { authedCloneUrl, git, githubToken, withTempDir } from "../lib/git";

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "__tests__", "test", "tests"]);
const TEST_FILE = /\.(test|spec)\.[^.]+$/;

async function* sourceFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(full);
    } else if (SOURCE_EXTENSIONS.test(entry.name) && !TEST_FILE.test(entry.name)) {
      yield full;
    }
  }
}

/** Scan a checked-out directory. Exported so callers with a local copy can skip cloning. */
export async function scanDirectory(root: string, spec: ChangeSpec): Promise<Match[]> {
  const patterns = spec.searchPatterns.map((p) => new RegExp(p));
  const matches: Match[] = [];
  for await (const file of sourceFiles(root)) {
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((text, i) => {
      if (patterns.some((re) => re.test(text))) {
        matches.push({ file: relative(root, file).split(sep).join("/"), line: i + 1, text: text.trim() });
      }
    });
  }
  return matches.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export async function scanRepo(repo: RepoTarget, spec: ChangeSpec): Promise<ScanResult> {
  const token = await githubToken();
  const matches = await withTempDir(`scan-${repo.name}`, async (dir) => {
    await git(["clone", "--depth", "1", "--branch", repo.defaultBranch, authedCloneUrl(repo, token), dir]);
    return scanDirectory(dir, spec);
  });
  return { repo, affected: matches.length > 0, matches };
}
