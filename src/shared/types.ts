// Placeholder copy of the shared contract. Person C owns this file; on merge, keep theirs.
export type ChangeType = "breaking" | "feature";

export interface ChangeSpec {
  id: string;                 // slug, e.g. "charges-to-paymentintents"
  title: string;
  summary: string;            // plain English, 1-3 sentences
  type: ChangeType;
  searchPatterns: string[];   // JS regex source strings, e.g. "stripe\\.charges\\.create\\("
  migrationSteps: string[];
  docsUrl: string;
  exampleBefore?: string;
  exampleAfter?: string;
  verify?: { mustNotMatch?: string[]; mustMatch?: string[] }; // regex sources, checked on non-test source after fix
}

export interface RepoTarget { owner: string; name: string; defaultBranch: string; cloneUrl: string; }
export interface Match { file: string; line: number; text: string; }
export interface ScanResult { repo: RepoTarget; affected: boolean; matches: Match[]; }

export type Stage =
  | "queued" | "scanning" | "unaffected" | "affected" | "fixing" | "testing"
  | "retrying" | "passed" | "rejected" | "pr_opened" | "error";

export interface RunEvent {
  runId: string; repo: string; stage: Stage; timestamp: number;
  message?: string; matches?: Match[]; prUrl?: string; testOutput?: string;
}

export type Emit = (e: Omit<RunEvent, "runId" | "timestamp">) => void;

export interface FixResult {
  status: "passed" | "rejected" | "error";
  diff: string;               // unified diff, applies with `git apply` at repo root
  changedFiles: string[];
  testOutput: string;
  typecheckOutput: string;
  attempts: number;
  rejectionReason?: string;
}
