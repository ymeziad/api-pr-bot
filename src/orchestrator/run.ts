import pLimit from "p-limit";
import type { ChangeSpec, RepoTarget, RunEvent } from "@/shared/types";
import { impl } from "./impl";

export async function runChange(
  spec: ChangeSpec,
  repos: RepoTarget[],
  onEvent: (e: RunEvent) => void,
  runId = "",
): Promise<void> {
  const { scanRepo, fixRepo, openPullRequest } = impl();
  const emit = (e: Omit<RunEvent, "runId" | "timestamp">) => onEvent({ ...e, runId, timestamp: Date.now() });
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

          const fix = await fixRepo({ repo, spec, scan, emit });
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
