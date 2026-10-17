// In-memory run store. Lives on globalThis so Next.js hot reload doesn't wipe it.
import { nanoid } from "nanoid";
import type { ChangeSpec, Match, RunEvent, Stage } from "@/shared/types";

export type StepStatus = "pending" | "active" | "done" | "failed";
export type StepKey = "scan" | "fix" | "test" | "pr";

export interface RepoState {
  repo: string;
  stage: Stage;
  steps: Record<StepKey, StepStatus>;
  skipped: boolean;          // unaffected: show the "Not affected" pill
  retrying: boolean;
  message?: string;
  matches: Match[];
  prUrl?: string;
  testOutput?: string;
  rejectionReason?: string;
  startedAt?: number;
  finishedAt?: number;
  done: boolean;
}

export interface RunState {
  runId: string;
  spec: ChangeSpec;
  events: RunEvent[];
  repos: Record<string, RepoState>;
  done: boolean;
  createdAt: number;
}

interface StoredRun { spec: ChangeSpec; events: RunEvent[]; createdAt: number }

const g = globalThis as unknown as { __runStore?: Map<string, StoredRun> };
const runs = (g.__runStore ??= new Map<string, StoredRun>());

export function createRun(spec: ChangeSpec): string {
  const runId = nanoid(10);
  runs.set(runId, { spec, events: [], createdAt: Date.now() });
  return runId;
}

export function appendEvent(runId: string, e: RunEvent): void {
  runs.get(runId)?.events.push(e);
}

const TERMINAL: Stage[] = ["unaffected", "rejected", "pr_opened", "error"];

function reduce(prev: RepoState | undefined, e: RunEvent): RepoState {
  const s: RepoState = prev
    ? { ...prev, steps: { ...prev.steps } }
    : { repo: e.repo, stage: e.stage, steps: { scan: "pending", fix: "pending", test: "pending", pr: "pending" }, skipped: false, retrying: false, matches: [], done: false };
  const st = s.steps;
  s.stage = e.stage;
  if (e.message !== undefined) s.message = e.message;
  if (e.matches) s.matches = e.matches;
  if (e.prUrl) s.prUrl = e.prUrl;
  if (e.testOutput) s.testOutput = e.testOutput;
  if (e.stage !== "queued" && s.startedAt === undefined) s.startedAt = e.timestamp;

  switch (e.stage) {
    case "scanning": st.scan = "active"; break;
    case "unaffected": st.scan = "done"; s.skipped = true; break;
    case "affected": st.scan = "done"; break;
    case "fixing":
      st.scan = "done"; if (st.fix !== "done") st.fix = "active"; break;
    case "testing":
      st.scan = "done"; st.fix = "done"; st.test = "active"; s.retrying = false; break;
    case "retrying":
      // never go backwards: fix stays done, test keeps spinning
      st.scan = "done"; st.fix = "done"; st.test = "active"; s.retrying = true; break;
    case "passed":
      st.scan = st.fix = st.test = "done"; st.pr = "active"; s.retrying = false; break;
    case "rejected":
      st.scan = st.fix = "done"; st.test = "failed"; s.retrying = false;
      s.rejectionReason = e.message; break;
    case "pr_opened":
      st.scan = st.fix = st.test = st.pr = "done"; break;
    case "error": {
      const active = (Object.keys(st) as StepKey[]).find((k) => st[k] === "active")
        ?? (Object.keys(st) as StepKey[]).find((k) => st[k] === "pending");
      if (active) st[active] = "failed";
      s.retrying = false;
      break;
    }
  }
  if (TERMINAL.includes(e.stage)) { s.done = true; s.finishedAt = e.timestamp; }
  return s;
}

export function getRun(runId: string): RunState | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  const repos: Record<string, RepoState> = {};
  for (const e of run.events) repos[e.repo] = reduce(repos[e.repo], e);
  const list = Object.values(repos);
  return {
    runId, spec: run.spec, events: run.events, repos, createdAt: run.createdAt,
    done: list.length > 0 && list.every((r) => r.done),
  };
}
