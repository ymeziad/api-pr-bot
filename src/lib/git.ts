import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RepoTarget } from "../shared/types";

const execFileAsync = promisify(execFile);

let cachedToken: string | null | undefined;

/** GITHUB_TOKEN, falling back to the local `gh` login. Never logged. */
export async function githubToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = process.env.GITHUB_TOKEN?.trim() || null;
  if (!cachedToken) {
    try {
      const { stdout } = await execFileAsync("gh", ["auth", "token"]);
      cachedToken = stdout.trim() || null;
    } catch {
      cachedToken = null;
    }
  }
  return cachedToken;
}

export async function requireGithubToken(): Promise<string> {
  const token = await githubToken();
  if (!token) throw new Error("No GitHub token: set GITHUB_TOKEN in .env.local or run `gh auth login`");
  return token;
}

function redact(text: string): string {
  return text.replace(/https:\/\/[^@\s/]+@/g, "https://***@");
}

/** Run git; on failure, throw with any credentials in the output redacted. */
export async function git(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    const shownArgs = args.map(redact).join(" ");
    throw new Error(`git ${shownArgs} failed: ${redact(e.stderr || e.message).trim()}`);
  }
}

export function authedCloneUrl(repo: RepoTarget, token: string | null): string {
  if (!token) return repo.cloneUrl;
  return repo.cloneUrl.replace(/^https:\/\//, `https://x-access-token:${encodeURIComponent(token)}@`);
}

export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), `${prefix}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
