import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Freestyle } from "freestyle";
import type { Vm } from "freestyle";

export interface ExecOpts {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Sandbox {
  readonly kind: "freestyle" | "docker";
  readonly id: string;
  exec(cmd: string, opts?: ExecOpts): Promise<ExecResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  destroy(): Promise<void>;
}

/** Exit code we report when a command is killed by our timeout (same as coreutils `timeout`). */
export const TIMEOUT_CODE = 124;

const DEFAULT_TIMEOUT_MS = 120_000;

/** Single-quote a string for bash. */
export const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const withCwd = (cmd: string, cwd?: string) => (cwd ? `cd ${sh(cwd)} && ${cmd}` : cmd);

const dirname = (p: string) => p.replace(/\/[^/]*$/, "") || "/";

export async function createSandbox(): Promise<Sandbox> {
  const kind = (process.env.SANDBOX ?? "freestyle").toLowerCase();
  if (kind === "docker") return DockerSandbox.create();
  if (kind === "freestyle") return FreestyleSandbox.create();
  throw new Error(`Unknown SANDBOX=${kind} (expected freestyle|docker)`);
}

// ---------------------------------------------------------------------------
// Freestyle
// ---------------------------------------------------------------------------

/**
 * vm.exec() caps out at 5 minutes. Anything longer than this runs detached in the
 * guest and we poll for its exit code.
 */
const FREESTYLE_DIRECT_EXEC_MAX_MS = 270_000;
const POLL_MS = 3_000;

export class FreestyleSandbox implements Sandbox {
  readonly kind = "freestyle" as const;

  private constructor(
    private readonly vm: Vm,
    readonly id: string,
  ) {}

  static async create(): Promise<FreestyleSandbox> {
    if (!process.env.FREESTYLE_API_KEY) throw new Error("FREESTYLE_API_KEY is not set");
    const freestyle = new Freestyle();
    const { vm, vmId } = await freestyle.vms.create({
      // A VM reaches nothing it has not been allowed to: we need npm, GitHub and Anthropic.
      firewall: { rules: [{ action: "allow", source: {}, destination: { public: true } }] },
      // Optional prebaked snapshot (Node + Claude Code + warm npm cache). Default image already has both.
      snapshotId: process.env.FREESTYLE_SNAPSHOT || undefined,
      displayName: `api-pr-bot-${randomUUID().slice(0, 8)}`,
      // Safety net: if destroy() never runs (crash, Ctrl-C), Freestyle deletes it anyway.
      ttlSeconds: 45 * 60,
    });
    const sb = new FreestyleSandbox(vm, vmId);
    // vm.exec runs as `ubuntu`; give it a workspace it owns.
    const mk = await sb.vm.exec({ command: "sudo install -d -o ubuntu -g ubuntu /work", timeoutMs: 30_000 });
    if (mk.statusCode !== 0) {
      await sb.destroy();
      throw new Error(`Freestyle VM ${vmId}: could not create /work: ${mk.stderr ?? ""}`);
    }
    return sb;
  }

  async exec(cmd: string, opts: ExecOpts = {}): Promise<ExecResult> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (timeoutMs > FREESTYLE_DIRECT_EXEC_MAX_MS) return this.execDetached(cmd, opts, timeoutMs);
    const r = await this.vm.exec({ command: withCwd(cmd, opts.cwd), timeoutMs, env: opts.env });
    return {
      code: r.statusCode ?? TIMEOUT_CODE,
      stdout: r.stdout ?? "",
      stderr: (r.stderr ?? "") + (r.statusCode == null ? `\n[sandbox] timed out after ${timeoutMs}ms` : ""),
    };
  }

  /** Run a long command detached (setsid + nohup) and poll a status file for its exit code. */
  private async execDetached(cmd: string, opts: ExecOpts, timeoutMs: number): Promise<ExecResult> {
    const dir = `/tmp/job-${randomUUID().slice(0, 8)}`;
    const script = `#!/bin/bash\n${withCwd(cmd, opts.cwd)}\n`;
    const runner =
      `#!/bin/bash\n` +
      `bash ${dir}/cmd.sh > ${dir}/out 2> ${dir}/err < /dev/null\n` +
      `echo $? > ${dir}/code.tmp && mv ${dir}/code.tmp ${dir}/code\n`;
    await this.writeFile(`${dir}/cmd.sh`, script);
    await this.writeFile(`${dir}/run.sh`, runner);
    // env is inherited by the detached child, so secrets never touch disk.
    const launch = await this.vm.exec({
      command: `setsid nohup bash ${dir}/run.sh > /dev/null 2>&1 < /dev/null & echo $! > ${dir}/pid`,
      timeoutMs: 30_000,
      env: opts.env,
    });
    if (launch.statusCode !== 0) throw new Error(`failed to launch detached job: ${launch.stderr ?? ""}`);

    const deadline = Date.now() + timeoutMs;
    let code: number | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const poll = await this.vm.exec({ command: `cat ${dir}/code 2>/dev/null || true`, timeoutMs: 20_000 });
      const txt = (poll.stdout ?? "").trim();
      if (txt !== "") {
        code = Number(txt);
        break;
      }
    }
    if (code === null) {
      // Kill the whole process group started by setsid.
      await this.vm.exec({ command: `kill -TERM -$(cat ${dir}/pid) 2>/dev/null; sleep 1; kill -KILL -$(cat ${dir}/pid) 2>/dev/null; true`, timeoutMs: 20_000 });
    }
    const out = await this.vm.exec({ command: `cat ${dir}/out 2>/dev/null`, timeoutMs: 30_000 });
    const err = await this.vm.exec({ command: `cat ${dir}/err 2>/dev/null`, timeoutMs: 30_000 });
    return {
      code: code ?? TIMEOUT_CODE,
      stdout: out.stdout ?? "",
      stderr: (err.stdout ?? "") + (code === null ? `\n[sandbox] timed out after ${timeoutMs}ms` : ""),
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Write through exec + stdin so the file is owned by the default (non-root) user.
    const r = await this.vm.exec({
      command: `mkdir -p ${sh(dirname(path))} && cat > ${sh(path)}`,
      stdin: Buffer.from(content, "utf8").toString("base64"),
      timeoutMs: 30_000,
    });
    if (r.statusCode !== 0) throw new Error(`writeFile ${path} failed: ${r.stderr ?? ""}`);
  }

  async readFile(path: string): Promise<string> {
    return this.vm.fs.readTextFile(path);
  }

  async destroy(): Promise<void> {
    await this.vm.delete();
  }
}

// ---------------------------------------------------------------------------
// Docker (fallback): local node:20 container
// ---------------------------------------------------------------------------

function run(
  bin: string,
  args: string[],
  opts: { stdin?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: opts.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: timedOut ? TIMEOUT_CODE : (code ?? 1),
        stdout,
        stderr: stderr + (timedOut ? `\n[sandbox] timed out after ${opts.timeoutMs}ms` : ""),
      });
    });
    child.stdin.end(opts.stdin ?? "");
  });
}

export class DockerSandbox implements Sandbox {
  readonly kind = "docker" as const;

  private constructor(readonly id: string) {}

  static async create(): Promise<DockerSandbox> {
    const image = process.env.DOCKER_IMAGE ?? "node:20";
    const r = await run(
      "docker",
      ["run", "-d", "--rm", "--label", "api-pr-bot=1", image, "sleep", "infinity"],
      { timeoutMs: 180_000 },
    );
    if (r.code !== 0) throw new Error(`docker run failed: ${r.stderr.trim()}`);
    const sb = new DockerSandbox(r.stdout.trim());
    const mk = await sb.exec("mkdir -p /work", { timeoutMs: 30_000 });
    if (mk.code !== 0) {
      await sb.destroy();
      throw new Error(`docker: could not create /work: ${mk.stderr}`);
    }
    return sb;
  }

  async exec(cmd: string, opts: ExecOpts = {}): Promise<ExecResult> {
    const args = ["exec", "-i"];
    if (opts.cwd) args.push("-w", opts.cwd);
    // `-e NAME` (no value) reads the value from our env, so secrets stay out of argv / `ps`.
    for (const k of Object.keys(opts.env ?? {})) args.push("-e", k);
    args.push(this.id, "bash", "-c", cmd);
    const r = await run("docker", args, {
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env: { ...process.env, ...opts.env },
    });
    if (r.code === TIMEOUT_CODE) {
      // Killing the docker CLI doesn't kill the process in the container; nuke stray node/claude procs.
      await run("docker", ["exec", this.id, "bash", "-c", "pkill -f claude; true"], { timeoutMs: 15_000 });
    }
    return r;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const r = await run("docker", ["exec", "-i", this.id, "bash", "-c", `mkdir -p ${sh(dirname(path))} && cat > ${sh(path)}`], {
      stdin: content,
      timeoutMs: 30_000,
    });
    if (r.code !== 0) throw new Error(`writeFile ${path} failed: ${r.stderr}`);
  }

  async readFile(path: string): Promise<string> {
    const r = await run("docker", ["exec", this.id, "cat", path], { timeoutMs: 30_000 });
    if (r.code !== 0) throw new Error(`readFile ${path} failed: ${r.stderr}`);
    return r.stdout;
  }

  async destroy(): Promise<void> {
    await run("docker", ["rm", "-f", this.id], { timeoutMs: 60_000 });
  }
}
