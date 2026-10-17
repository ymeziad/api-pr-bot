/**
 * GO/NO-GO spike: one sandbox, clone a public repo, npm install, npm test, claude -p "say hi".
 *
 *   npx tsx src/fixer/spike.ts [cloneUrl]
 *   SANDBOX=docker npx tsx src/fixer/spike.ts
 */
import { existsSync } from "node:fs";
import { createSandbox } from "./sandbox";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const url = process.argv[2] ?? "https://github.com/sindresorhus/is-plain-obj.git";

async function main() {
  const t0 = Date.now();
  const lap = (m: string) => console.log(`[spike] ${m} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const sb = await createSandbox();
  lap(`sandbox ${sb.kind} ${sb.id} up`);
  try {
    const step = async (name: string, cmd: string, opts: Parameters<typeof sb.exec>[1] = {}) => {
      const r = await sb.exec(cmd, opts);
      lap(`${name} → exit ${r.code}`);
      console.log((r.stdout + r.stderr).trim().split("\n").slice(-8).join("\n"));
      return r;
    };
    await step("whoami/tools", "whoami; node -v; npm -v; git --version; which claude; claude --version");
    await step("clone", `git clone --depth 1 ${url} /work/repo 2>&1`, { timeoutMs: 120_000 });
    await step("npm install", "npm install --no-audit --no-fund 2>&1", { cwd: "/work/repo", timeoutMs: 240_000 });
    await step("npm test", "CI=true npm test 2>&1", { cwd: "/work/repo", timeoutMs: 240_000 });
    await sb.writeFile("/work/hello.txt", "hello from writeFile\n");
    lap(`readFile → ${JSON.stringify(await sb.readFile("/work/hello.txt"))}`);
    // > 270s timeout forces the detached + poll path on Freestyle.
    await step(
      "claude say hi (detached path)",
      `claude -p "say hi in five words" --output-format json --max-turns 2 --model ${process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"}`,
      { cwd: "/work/repo", timeoutMs: 360_000, env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "" } },
    );
    await step("timeout path", "sleep 5", { timeoutMs: 2_000 });
  } finally {
    await sb.destroy();
    lap("destroyed");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
