import pLimit from "p-limit";
import type { ChangeSpec, RepoTarget, RunEvent } from "@/shared/types";
import { impl } from "./impl";

const DEFAULT_MESSAGES: Partial<Record<RunEvent["stage"], string>> = {
  queued: "Queued",
  fixing: "Claude Code is fixing it in a sandbox VM",
  testing: "Running typecheck + tests",
  retrying: "Retrying: gate failed, feeding output back to Claude",
  passed: "Typecheck clean · all tests passed · tests untouched",
};

export async function runChange(
  spec: ChangeSpec,
  repos: RepoTarget[],
  onEvent: (e: RunEvent) => void,
  runId = "",
): Promise<void> {
  const { scanRepo, fixRepo, openPullRequest } = impl();
  // The fixer may emit bare stages; give each one a readable default so rows never look frozen.
  const emit = (e: Omit<RunEvent, "runId" | "timestamp">) =>
    onEvent({ ...e, message: e.message ?? DEFAULT_MESSAGES[e.stage], runId, timestamp: Date.now() });
  const limit = pLimit(3);

  // Emitted synchronously so every row shows up on the first poll.
  for (const repo of repos) emit({ repo: repo.name, stage: "queued" });

  await Promise.all(
    repos.map((repo) =>
      limit(async () => {
        try {
          emit({ repo: repo.name, stage: "scanning", message: "Searching code for affected calls" });
          const scan = await scanRepo(repo, spec);
          if (!scan.affected) {
            emit({ repo: repo.name, stage: "unaffected", message: "No matching code: skipped", matches: [] });
            return;
          }
          emit({ repo: repo.name, stage: "affected", matches: scan.matches, message: `${scan.matches.length} affected location(s)` });

          // fixRepo emits its own "passed"; we emit it below with the PR step, so drop the fixer's copy.
          const fix = await fixRepo({ repo, spec, scan, emit: (e) => e.stage !== "passed" && emit(e) });
          if (fix.status === "passed") {
            emit({ repo: repo.name, stage: "passed", message: "Opening pull request", testOutput: fix.testOutput || undefined });
            const prUrl = await openPullRequest({ repo, spec, scan, fix });
            emit({ repo: repo.name, stage: "pr_opened", prUrl, message: "Pull request opened" });
          } else if (fix.status === "rejected") {
            emit({ repo: repo.name, stage: "rejected", message: fix.rejectionReason ?? "Fix did not pass the gate", testOutput: fix.testOutput || undefined });
          } else {
            emit({ repo: repo.name, stage: "error", message: fix.rejectionReason ?? "Fixer error", testOutput: fix.testOutput || undefined });
          }
        } catch (err) {
          emit({ repo: repo.name, stage: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }),
    ),
  );
}
