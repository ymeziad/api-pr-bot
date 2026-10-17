import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChangeSpec, Emit, FixResult, RepoTarget, ScanResult } from "@/shared/types";
import { createSandbox, sh, TIMEOUT_CODE, type Sandbox } from "./sandbox";
import { revertFiles, runGate, type GateResult } from "./gate";

export { createSandbox } from "./sandbox";
export * from "./gate";

const REPO_DIR = "/work/repo";
const PROMPT_FILE = "/work/prompt.txt";
const CLAUDE_TIMEOUT_MS = 6 * 60_000;
const MAX_ATTEMPTS = 2;
const MAX_OUTPUT_CHARS = 20_000;

const ALLOWED_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(npm run typecheck)",
  "Bash(npm run typecheck:*)",
  "Bash(npm test)",
  "Bash(npm test:*)",
].join(",");

/** Logger: `[fixer][acme-shop] npm ci done 18.2s` */
function makeLog(repo: string) {
  const t0 = Date.now();
  let last = t0;
  return (msg: string) => {
    const now = Date.now();
    const step = ((now - last) / 1000).toFixed(1);
    const total = ((now - t0) / 1000).toFixed(1);
    last = now;
    console.log(`${new Date(now).toISOString().slice(11, 19)} [fixer][${repo}] ${msg} (+${step}s, ${total}s total)`);
  };
}

const tail = (s: string, lines: number) => s.trimEnd().split("\n").slice(-lines).join("\n");
const cap = (s: string) => (s.length > MAX_OUTPUT_CHARS ? "…(truncated)\n" + s.slice(-MAX_OUTPUT_CHARS) : s);
const short = (s: string) => (s.length > 160 ? s.slice(0, 157) + "…" : s);

export function buildPrompt(spec: ChangeSpec, scan: ScanResult, previousFailure?: string): string {
  const steps = spec.migrationSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const example =
    spec.exampleBefore && spec.exampleAfter ? `\nBEFORE:\n${spec.exampleBefore}\nAFTER:\n${spec.exampleAfter}\n` : "";
  const matches = scan.matches.map((m) => `${m.file}:${m.line}: ${m.text.trim()}`).join("\n") || "(none listed)";
  let prompt = `You are migrating this repository for an API change announced by the vendor.

CHANGE: ${spec.title}
TYPE: ${spec.type}
SUMMARY: ${spec.summary}
MIGRATION STEPS:
${steps}
${example}
DOCS: ${spec.docsUrl}

AFFECTED LOCATIONS (found by scanner):
${matches}

RULES:
- Change only application source code needed for this migration. Keep behavior the same.
- Do NOT modify any test files, test config, tsconfig, package.json, or lockfiles.
- Do not add dependencies.
- When done, run \`npm run typecheck\` and \`npm test\` and fix any failures in source code.
- Keep the diff minimal and idiomatic.
`;
  if (previousFailure) {
    prompt += `
YOUR PREVIOUS ATTEMPT FAILED:
${previousFailure}

Fix it. Do not modify tests or config.
`;
  }
  return prompt;
}

/** Feedback for attempt 2: reason + last 60 lines of the failing output. */
function failureFeedback(g: Extract<GateResult, { ok: false }>): string {
  return `${g.reason}\n\n${tail(g.details, 60)}`;
}

async function ensureClaude(sb: Sandbox, log: (m: string) => void) {
  const v = await sb.exec("claude --version", { timeoutMs: 30_000 });
  if (v.code === 0) {
    log(`claude ${v.stdout.trim()}`);
    return;
  }
  log("claude not found, installing @anthropic-ai/claude-code");
  const i = await sb.exec(
    "SUDO=$(sudo -n true 2>/dev/null && echo sudo); $SUDO npm i -g @anthropic-ai/claude-code 2>&1",
    { timeoutMs: 240_000 },
  );
  if (i.code !== 0) throw new Error(`could not install claude: ${tail(i.stdout + i.stderr, 20)}`);
  const v2 = await sb.exec("claude --version", { timeoutMs: 30_000 });
  if (v2.code !== 0) throw new Error(`claude still unavailable after install: ${v2.stderr}`);
  log(`claude installed ${v2.stdout.trim()}`);
}

async function runClaude(sb: Sandbox, prompt: string, log: (m: string) => void) {
  await sb.writeFile(PROMPT_FILE, prompt);
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const cmd =
    `claude -p "$(cat ${PROMPT_FILE})" --output-format json --permission-mode acceptEdits ` +
    `--allowedTools ${sh(ALLOWED_TOOLS)} --max-turns 30 --model ${sh(model)} --no-session-persistence`;
  const r = await sb.exec(cmd, {
    cwd: REPO_DIR,
    timeoutMs: CLAUDE_TIMEOUT_MS,
    // The only secret that ever enters the sandbox. Never GITHUB_TOKEN.
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!, DISABLE_AUTOUPDATER: "1", CI: "true" },
  });
  // Informational only: we never trust the agent's own verdict, the gate decides.
  try {
    const j = JSON.parse(r.stdout);
    log(
      `claude exit=${r.code} subtype=${j.subtype} turns=${j.num_turns} cost=$${Number(j.total_cost_usd ?? 0).toFixed(2)} ` +
        `says: ${short(String(j.result ?? "").replace(/\s+/g, " "))}`,
    );
  } catch {
    log(`claude exit=${r.code}${r.code === TIMEOUT_CODE ? " (TIMED OUT)" : ""} stderr: ${short(tail(r.stderr, 3))}`);
  }
  return r;
}

export async function fixRepo(args: {
  repo: RepoTarget;
  spec: ChangeSpec;
  scan: ScanResult;
  emit: Emit;
}): Promise<FixResult> {
  const { repo, spec, scan, emit } = args;
  const log = makeLog(repo.name);
  const result: FixResult = { status: "error", diff: "", changedFiles: [], testOutput: "", typecheckOutput: "", attempts: 0 };

  emit({ repo: repo.name, stage: "fixing" });

  let sb: Sandbox | undefined;
  try {
    // --- infrastructure: failures here are status "error" ---
    try {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
      sb = await createSandbox();
      log(`sandbox ${sb.kind} ${sb.id} up`);

      const source = repo.cloneUrl.startsWith("file://") ? await uploadLocalRepo(sb, repo.cloneUrl) : repo.cloneUrl;
      const clone = await sb.exec(`git clone --depth 1 --branch ${sh(repo.defaultBranch)} ${sh(source)} ${REPO_DIR} 2>&1`, {
        timeoutMs: 120_000,
      });
      if (clone.code !== 0) throw new Error(`git clone failed: ${tail(clone.stdout + clone.stderr, 5)}`);
      // Keep install artifacts out of `git status` even if the repo forgot a .gitignore.
      await sb.exec("printf 'node_modules/\\n' >> .git/info/exclude", { cwd: REPO_DIR });
      log("clone done");

      const install = await sb.exec(
        "(if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi) 2>&1 " +
          "|| npm install --no-audit --no-fund 2>&1",
        { cwd: REPO_DIR, timeoutMs: 240_000 },
      );
      if (install.code !== 0) throw new Error(`npm install failed: ${tail(install.stdout + install.stderr, 10)}`);
      // npm install can rewrite the lockfile; reset so it isn't mistaken for an agent edit.
      await sb.exec("git checkout -- package-lock.json 2>/dev/null; true", { cwd: REPO_DIR });
      log("npm install done");

      await ensureClaude(sb, log);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`ERROR ${message}`);
      emit({ repo: repo.name, stage: "error", message: short(message) });
      return { ...result, status: "error", rejectionReason: message };
    }

    // --- agent + gate ---
    let previousFailure: string | undefined;
    let gate: GateResult | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      result.attempts = attempt;
      log(`attempt ${attempt}: running claude`);
      await runClaude(sb, buildPrompt(spec, scan, previousFailure), log);
      await sabotage(sb, attempt, log);

      log(`attempt ${attempt}: gate`);
      gate = await runGate(sb, REPO_DIR, spec, () => emit({ repo: repo.name, stage: "testing" }));
      result.typecheckOutput = cap(gate.typecheckOutput);
      result.testOutput = cap(gate.testOutput);

      if (gate.ok) break;
      log(`attempt ${attempt}: gate FAILED (${gate.check}): ${gate.reason}`);
      if (attempt < MAX_ATTEMPTS) {
        emit({ repo: repo.name, stage: "retrying", message: short(gate.reason) });
        if (gate.check === "protected" && gate.protectedFiles) {
          await revertFiles(sb, REPO_DIR, gate.protectedFiles);
          log(`reverted protected files: ${gate.protectedFiles.join(", ")}`);
        }
        previousFailure = failureFeedback(gate);
      }
    }

    if (!gate || !gate.ok) {
      const reason = gate && !gate.ok ? gate.reason : "gate did not run";
      log(`REJECTED: ${reason}`);
      result.changedFiles = gate?.changedFiles ?? [];
      emit({ repo: repo.name, stage: "rejected", message: short(reason) });
      return { ...result, status: "rejected", rejectionReason: reason };
    }

    // --- passed: capture the diff (git add -A so new files are included) ---
    const diff = await sb.exec("git add -A && git diff --cached --binary", { cwd: REPO_DIR, timeoutMs: 60_000 });
    if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
    result.diff = diff.stdout;
    result.changedFiles = await stagedFiles(sb);
    log(`PASSED in ${result.attempts} attempt(s): ${result.changedFiles.join(", ")}`);
    emit({ repo: repo.name, stage: "passed", testOutput: tail(result.testOutput, 40) });
    return { ...result, status: "passed" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`ERROR ${message}`);
    emit({ repo: repo.name, stage: "error", message: short(message) });
    return { ...result, status: "error", rejectionReason: message };
  } finally {
    if (sb) {
      await sb.destroy().then(
        () => log("sandbox destroyed"),
        (e) => log(`WARN sandbox destroy failed: ${e instanceof Error ? e.message : e}`),
      );
    }
  }
}

/**
 * Dev-only: FIXER_SABOTAGE forces a gate failure after the agent runs, to exercise the retry path.
 *   typecheck        – attempt 1: append a type error to a file the agent changed (agent must fix it)
 *   protected        – attempt 1: edit a test file (we revert it, agent retries)
 *   protected-always – every attempt: edit a test file (ends in "rejected")
 */
async function sabotage(sb: Sandbox, attempt: number, log: (m: string) => void) {
  const mode = process.env.FIXER_SABOTAGE;
  if (!mode || (attempt > 1 && mode !== "protected-always")) return;
  const pick = mode === "typecheck"
    ? "git diff --name-only -- '*.ts' | head -1"
    : "git ls-files | grep -E '(^|/)(tests?|__tests__)/|\\.(test|spec)\\.' | head -1";
  const file = (await sb.exec(pick, { cwd: REPO_DIR })).stdout.trim();
  if (!file) return log(`SABOTAGE(${mode}): no target file found, skipping`);
  const line = mode === "typecheck" ? `export const __sabotage: number = "not a number";` : `// sabotage: agent edited a test`;
  await sb.exec(`printf '\\n%s\\n' ${sh(line)} >> ${sh(file)}`, { cwd: REPO_DIR });
  log(`SABOTAGE(${mode}) attempt ${attempt}: modified ${file}`);
}

/**
 * Dev-only: a file:// cloneUrl points at a repo on this machine, which the sandbox can't reach.
 * Ship it in as a git bundle so it can be cloned like a remote. Returns the in-sandbox path.
 */
export async function uploadLocalRepo(sb: Sandbox, cloneUrl: string): Promise<string> {
  const dir = fileURLToPath(cloneUrl);
  const bundle = join(tmpdir(), `fixer-${randomUUID().slice(0, 8)}.bundle`);
  execFileSync("git", ["-C", dir, "bundle", "create", bundle, "--all"], { stdio: "pipe" });
  const b64 = readFileSync(bundle).toString("base64");
  rmSync(bundle, { force: true });
  await sb.writeFile("/work/repo.bundle.b64", b64);
  const r = await sb.exec("base64 -d /work/repo.bundle.b64 > /work/repo.bundle", { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`could not unpack bundle: ${r.stderr}`);
  return "/work/repo.bundle";
}

async function stagedFiles(sb: Sandbox): Promise<string[]> {
  const r = await sb.exec("git -c core.quotepath=off diff --cached --name-only", { cwd: REPO_DIR });
  return r.stdout.split("\n").filter(Boolean);
}

