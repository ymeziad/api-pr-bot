/**
 * Forces every gate outcome on one sandbox, no LLM involved.
 *
 *   npx tsx src/fixer/gate-selftest.ts [cloneUrl|local path] [good.diff]
 *
 * Defaults to the public acme-shop demo repo and Person B's reference diff.
 */
import { existsSync, readFileSync } from "node:fs";
import { createSandbox, sh } from "./sandbox";
import { revertFiles, runGate, changedFiles } from "./gate";
import { uploadLocalRepo } from "./index";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const [repoArg = "https://github.com/ymeziad/acme-shop.git", goodDiff = "scripts/fixtures/acme-shop--charges-to-paymentintents.diff"] =
  process.argv.slice(2);
const spec = JSON.parse(readFileSync("config/specs/charges-to-paymentintents.json", "utf8"));
const R = "/work/repo";

async function main() {
  const sb = await createSandbox();
  let failures = 0;
  try {
    const src = /^https?:/.test(repoArg) ? repoArg : await uploadLocalRepo(sb, `file://${repoArg}`);
    await sb.exec(`git clone --depth 1 ${src} ${R} && cd ${R} && npm ci --no-audit --no-fund`, { timeoutMs: 240_000 });

    const reset = async () => {
      await revertFiles(sb, R, await changedFiles(sb, R));
    };
    const expect = async (name: string, want: string, mutate: string) => {
      await reset();
      if (mutate) await sb.exec(mutate, { cwd: R });
      const g = await runGate(sb, R, spec);
      const got = g.ok ? "pass" : g.check;
      const ok = got === want;
      if (!ok) failures++;
      console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(28)} want=${want} got=${got}${g.ok ? "" : ` (${g.reason})`}`);
    };

    await expect("edits a test file", "protected", `echo '// hi' >> test/checkout.test.ts`);
    await expect("edits package.json", "protected", `sed -i 's/"private": true/"private": false/' package.json`);
    await expect("adds tests/ file", "protected", `mkdir -p tests && echo x > tests/new.ts`);
    await expect("no changes", "empty", "");
    await expect("type error", "typecheck", `echo 'export const x: number = "s";' >> src/checkout.ts`);
    await expect("behavior broken", "tests", `sed -i 's/ok: charge.paid/ok: !charge.paid/' src/subscriptions.ts`);
    await expect("unmigrated (comment only)", "verify", `echo '// touched' >> src/checkout.ts`);
    await sb.writeFile("/work/good.diff", readFileSync(goodDiff, "utf8"));
    await expect("real migration", "pass", `git apply /work/good.diff`);
    // Revert must also delete new untracked protected files.
    await sb.exec(`mkdir -p tests && echo x > tests/new.ts`, { cwd: R });
    await revertFiles(sb, R, ["tests/new.ts"]);
    const gone = (await sb.exec(`test -e ${sh("tests/new.ts")} && echo still || echo gone`, { cwd: R })).stdout.trim();
    console.log(`${gone === "gone" ? "OK  " : "FAIL"} revert deletes new files      ${gone}`);
    if (gone !== "gone") failures++;
  } finally {
    await sb.destroy();
  }
  console.log(failures === 0 ? "\nALL GATE CHECKS OK" : `\n${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
