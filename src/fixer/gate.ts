import type { ChangeSpec } from "@/shared/types";
import { sh, type Sandbox } from "./sandbox";

/**
 * Paths the agent must never touch. Matched against repo-relative paths from git.
 * Spec list: *.test.ts, *.spec.ts, **\/__tests__/**, test/**, tests/**, vitest.config.*,
 * tsconfig*.json, package.json, package-lock.json (widened to js/tsx test variants).
 */
const PROTECTED: RegExp[] = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)__tests__\//,
  /^tests?\//,
  /(^|\/)vitest\.config\.[^/]+$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)package\.json$/,
  /(^|\/)package-lock\.json$/,
];

export const isProtectedPath = (file: string) => PROTECTED.some((re) => re.test(file));

/** Test-ish files, excluded from verify-pattern scanning. */
const TEST_FILE: RegExp[] = [/\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)__tests__\//, /^tests?\//, /(^|\/)__mocks__\//];
const SOURCE_EXT = /\.[cm]?[jt]sx?$/;

export interface GateOutputs {
  typecheckOutput: string;
  testOutput: string;
}

export type GateResult =
  | ({ ok: true; changedFiles: string[] } & GateOutputs)
  | ({
      ok: false;
      check: "protected" | "typecheck" | "tests" | "verify" | "empty";
      reason: string;
      /** Raw output that explains the failure, fed back to the agent on retry. */
      details: string;
      changedFiles: string[];
      protectedFiles?: string[];
    } & GateOutputs);

const combine = (r: { stdout: string; stderr: string }) => [r.stdout, r.stderr].filter(Boolean).join("\n").trim();

/** Every path that differs from HEAD, including untracked new files and deletions. */
export async function changedFiles(sb: Sandbox, repoDir: string): Promise<string[]> {
  const r = await sb.exec("git -c core.quotepath=off status --porcelain=v1 -uall", { cwd: repoDir });
  if (r.code !== 0) throw new Error(`git status failed: ${r.stderr}`);
  return r.stdout
    .split("\n")
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3))
    .map((p) => (p.includes(" -> ") ? p.split(" -> ")[1] : p))
    .map((p) => p.replace(/^"(.*)"$/, "$1"))
    .filter((p) => !p.startsWith("node_modules/"));
}

export function findProtected(files: string[]): string[] {
  return files.filter(isProtectedPath);
}

/** Undo the agent's edits to protected files (restore tracked ones, delete new ones). */
export async function revertFiles(sb: Sandbox, repoDir: string, files: string[]): Promise<void> {
  for (const f of files) {
    await sb.exec(`git checkout HEAD -- ${sh(f)} 2>/dev/null || rm -rf -- ${sh(f)}`, { cwd: repoDir });
  }
}

export async function runTypecheck(sb: Sandbox, repoDir: string) {
  const r = await sb.exec("NO_COLOR=1 FORCE_COLOR=0 npm run typecheck 2>&1", { cwd: repoDir, timeoutMs: 180_000 });
  return { ok: r.code === 0, output: combine(r) };
}

export async function runTests(sb: Sandbox, repoDir: string) {
  // CI=true keeps vitest out of watch mode even if the script is plain `vitest`.
  const r = await sb.exec("CI=true NO_COLOR=1 FORCE_COLOR=0 npm test 2>&1", { cwd: repoDir, timeoutMs: 240_000 });
  return { ok: r.code === 0, output: combine(r) };
}

/**
 * Runs inside the sandbox with node: reads every non-test source file and counts regex hits.
 * Input on stdin: { files, mustNotMatch, mustMatch }.
 */
const VERIFY_SCRIPT = `
const fs = require("fs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const res = { violations: [], missing: [] };
const texts = input.files.map((f) => { try { return [f, fs.readFileSync(f, "utf8")]; } catch { return [f, ""]; } });
for (const src of input.mustNotMatch) {
  const re = new RegExp(src, "gm");
  for (const [f, t] of texts) {
    for (const m of t.matchAll(re)) {
      const line = t.slice(0, m.index).split("\\n").length;
      res.violations.push({ pattern: src, file: f, line, text: t.split("\\n")[line - 1].trim() });
      if (m[0].length === 0) break;
    }
  }
}
for (const src of input.mustMatch) {
  const re = new RegExp(src, "m");
  if (!texts.some(([, t]) => re.test(t))) res.missing.push(src);
}
console.log(JSON.stringify(res));
`;

export async function checkVerifyPatterns(sb: Sandbox, repoDir: string, verify: ChangeSpec["verify"]) {
  const mustNotMatch = verify?.mustNotMatch ?? [];
  const mustMatch = verify?.mustMatch ?? [];
  if (mustNotMatch.length === 0 && mustMatch.length === 0) return { ok: true, details: "" };

  const ls = await sb.exec("git -c core.quotepath=off ls-files -co --exclude-standard", { cwd: repoDir });
  const files = ls.stdout
    .split("\n")
    .filter(Boolean)
    .filter((f) => SOURCE_EXT.test(f) && !f.startsWith("node_modules/") && !TEST_FILE.some((re) => re.test(f)));

  await sb.writeFile("/tmp/verify.js", VERIFY_SCRIPT);
  await sb.writeFile("/tmp/verify-input.json", JSON.stringify({ files, mustNotMatch, mustMatch }));
  const r = await sb.exec("node /tmp/verify.js < /tmp/verify-input.json", { cwd: repoDir });
  if (r.code !== 0) throw new Error(`verify script failed: ${r.stderr}`);
  const res = JSON.parse(r.stdout.trim().split("\n").pop()!) as {
    violations: { pattern: string; file: string; line: number; text: string }[];
    missing: string[];
  };
  const lines = [
    ...res.violations.map((v) => `still matches /${v.pattern}/ at ${v.file}:${v.line}: ${v.text}`),
    ...res.missing.map((p) => `expected at least one match for /${p}/ in source, found none`),
  ];
  return { ok: lines.length === 0, details: lines.join("\n") };
}

/**
 * The full gate, in order: protected files → typecheck → tests → verify patterns → non-empty diff.
 * `onTesting` fires right before typecheck/tests start (for the "testing" stage event).
 */
export async function runGate(
  sb: Sandbox,
  repoDir: string,
  spec: ChangeSpec,
  onTesting?: () => void,
): Promise<GateResult> {
  const empty: GateOutputs = { typecheckOutput: "", testOutput: "" };
  const files = await changedFiles(sb, repoDir);

  const prot = findProtected(files);
  if (prot.length > 0) {
    return {
      ok: false,
      check: "protected",
      reason: `agent modified tests or config: ${prot.join(", ")}`,
      details: `Protected files changed: ${prot.join(", ")}`,
      changedFiles: files,
      protectedFiles: prot,
      ...empty,
    };
  }

  // Cheap check before the slow ones; the spec lists it last but the outcome is identical.
  if (files.length === 0) {
    return { ok: false, check: "empty", reason: "no changes were made", details: "The diff is empty.", changedFiles: files, ...empty };
  }

  onTesting?.();
  const tc = await runTypecheck(sb, repoDir);
  if (!tc.ok) {
    return { ok: false, check: "typecheck", reason: "typecheck failed", details: tc.output, changedFiles: files, typecheckOutput: tc.output, testOutput: "" };
  }

  const tests = await runTests(sb, repoDir);
  if (!tests.ok) {
    return { ok: false, check: "tests", reason: "tests failed", details: tests.output, changedFiles: files, typecheckOutput: tc.output, testOutput: tests.output };
  }

  const v = await checkVerifyPatterns(sb, repoDir, spec.verify);
  if (!v.ok) {
    return {
      ok: false,
      check: "verify",
      reason: `migration incomplete: ${v.details.split("\n")[0]}`,
      details: v.details,
      changedFiles: files,
      typecheckOutput: tc.output,
      testOutput: tests.output,
    };
  }

  return { ok: true, changedFiles: files, typecheckOutput: tc.output, testOutput: tests.output };
}
