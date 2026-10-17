import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FixResult } from "../shared/types";

/**
 * Known-good, hand-verified fixes for the demo repos (tests pass unchanged).
 * Returns null when there is no fixture for this repo + spec. Useful for USE_MOCKS=true.
 */
export function loadFixtureFix(repoName: string, specId: string): FixResult | null {
  const base = join(process.cwd(), "scripts", "fixtures", `${repoName}--${specId}`);
  if (!existsSync(`${base}.diff`)) return null;
  const diff = readFileSync(`${base}.diff`, "utf8");
  const changedFiles = [...diff.matchAll(/^diff --git a\/.+? b\/(.+)$/gm)].map((m) => m[1]);
  const testOutput = existsSync(`${base}.test-output.txt`) ? readFileSync(`${base}.test-output.txt`, "utf8") : "";
  return { status: "passed", diff, changedFiles, testOutput, typecheckOutput: "", attempts: 1 };
}
