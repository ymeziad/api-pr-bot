"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight, BookOpen, Check, ChevronDown, CircleSlash, ExternalLink, GitPullRequest, Loader2, Play,
  RotateCw, Sparkles, X, Zap,
} from "lucide-react";
import type { ChangeSpec } from "@/shared/types";
import type { RepoState, RunState, StepKey, StepStatus } from "@/orchestrator/store";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "charges-to-paymentintents", label: "Charges → PaymentIntents", tag: "breaking" },
  { id: "payment-intents-automatic-payment-methods", label: "Automatic payment methods", tag: "feature" },
] as const;

const STEPS: { key: StepKey; label: string }[] = [
  { key: "scan", label: "Scan" },
  { key: "fix", label: "Fix" },
  { key: "test", label: "Test" },
  { key: "pr", label: "PR" },
];

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// Rejection reasons can be multi-line npm output; rows show the first line, the title holds the rest.
function firstLine(text: string, max = 120) {
  const line = text.trim().split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Dashboard({ mocks }: { mocks: boolean }) {
  const [input, setInput] = useState("");
  const [compiling, setCompiling] = useState<string | null>(null);
  const [spec, setSpec] = useState<ChangeSpec | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);
  const [lost, setLost] = useState(false); // polling gave up; the run may still exist but we can't see it

  const stopPolling = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };
  useEffect(() => stopPolling, []);

  // Tick the elapsed timers while a run is live.
  useEffect(() => {
    if (!run || run.done || lost) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [run, lost]);

  const compile = useCallback(async (body: { cachedId?: string; url?: string; text?: string }, key: string) => {
    setCompiling(key); setError(null); stopPolling(); setRun(null); setSpec(null);
    try {
      const res = await fetch("/api/compile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Compile failed");
      setSpec(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompiling(null);
    }
  }, []);

  const compileInput = () => {
    const v = input.trim();
    if (!v) return;
    compile(/^https?:\/\//.test(v) ? { url: v } : { text: v }, "input");
  };

  const startRun = async () => {
    if (!spec) return;
    setStarting(true); setError(null); stopPolling(); setExpanded(null); setLost(false);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed to start");
      let failures = 0;
      let stopped = false;
      const finish = () => { stopped = true; stopPolling(); };
      const giveUp = (message: string) => { finish(); setLost(true); setError(message); };
      const poll = async () => {
        if (inFlight.current) return; // never overlap: a slow response must not roll the UI back
        inFlight.current = true;
        try {
          const r = await fetch(`/api/runs/${data.runId}`, { cache: "no-store" });
          if (r.status === 404) return giveUp("Run state was lost (the server restarted). Click Run again.");
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const state = (await r.json()) as RunState;
          failures = 0;
          setRun(state);
          setNow(Date.now());
          if (state.done) finish();
        } catch {
          if (++failures >= 3) giveUp("Lost connection to the server. Check that npm run dev is running, then click Run again.");
        } finally {
          inFlight.current = false;
        }
      };
      inFlight.current = false;
      await poll();
      if (!stopped) pollRef.current = setInterval(poll, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const repos = run ? Object.values(run.repos) : [];
  const totals = {
    checked: repos.length,
    prs: repos.filter((r) => r.stage === "pr_opened").length,
    skipped: repos.filter((r) => r.skipped).length,
    rejected: repos.filter((r) => r.stage === "rejected" || r.stage === "error").length,
  };

  return (
    <main className="min-h-screen pb-24">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-white/[0.06]">
        <BackgroundBeams />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#07080c]" />
        <div className="relative mx-auto max-w-6xl px-6 py-14">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
              <Zap className="h-5 w-5 text-white" fill="currentColor" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Shipfix</span>
            {mocks && (
              <span
                title="USE_MOCKS is not &quot;false&quot;: fake pipeline, fake PR links"
                className="ml-2 rounded-md bg-amber-400/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/40"
              >
                Mock data
              </span>
            )}
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            API vendors ship the fix,
            <span className="bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent"> not just the changelog.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-400">
            Describe an API change. Shipfix finds every affected customer repo, fixes it in a sandbox, proves it with tests, and opens the pull request.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-8">
        {/* Change input */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <label className="text-sm font-medium text-slate-300" htmlFor="change">Describe an API change</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <textarea
              id="change"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) compileInput(); }}
              placeholder="Paste a docs URL or changelog text…"
              rows={2}
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[15px] text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              onClick={compileInput}
              disabled={!input.trim() || compiling !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 font-medium text-slate-100 transition hover:bg-white/[0.1] disabled:opacity-40"
            >
              {compiling === "input" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Compile
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-slate-500">Quick pick:</span>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => compile({ cachedId: p.id }, p.id)}
                disabled={compiling !== null}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition disabled:opacity-50",
                  spec?.id === p.id ? "border-indigo-500/60 bg-indigo-500/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
                )}
              >
                {compiling === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                  <span className={cn("h-2 w-2 rounded-full", p.tag === "breaking" ? "bg-rose-500" : "bg-sky-500")} />
                )}
                {p.label}
                <span className="text-slate-500">({p.tag})</span>
              </button>
            ))}
          </div>
          {error && <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        </section>

        {/* Summary card */}
        {spec && (
          <section key={spec.id} className="animate-fade-up rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                  spec.type === "breaking" ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30" : "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
                )}>
                  {spec.type === "breaking" ? "Breaking" : "New feature"}
                </span>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{spec.title}</h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-400">{spec.summary}</p>
              </div>
              <ShimmerButton onClick={startRun} disabled={starting || (run !== null && !run.done && !lost)} className="px-7 py-3.5 text-base">
                {starting || (run && !run.done && !lost) ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" fill="currentColor" />}
                {run && !run.done && !lost ? "Running…" : run?.done || lost ? "Run again" : "Run on connected repos"}
              </ShimmerButton>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Looks for</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {spec.searchPatterns.map((p) => (
                    <code key={p} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[13px] text-amber-200/90">{p}</code>
                  ))}
                </div>
                <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-indigo-300 hover:text-indigo-200">
                  <BookOpen className="h-4 w-4" /> Migration docs <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Migration steps</h3>
                <ol className="mt-2 space-y-2">
                  {spec.migrationSteps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-300">
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/[0.06] text-xs font-medium text-slate-400">{i + 1}</span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        )}

        {/* Repo table */}
        {run && (
          <section className="animate-fade-up overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h2 className="font-semibold text-white">Connected repositories</h2>
              <span className="flex items-center gap-2 text-sm text-slate-400">
                {run.done ? <><Check className="h-4 w-4 text-emerald-400" /> Run complete</>
                  : lost ? <><X className="h-4 w-4 text-rose-400" /> Stopped</>
                  : <><span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" /> Live</>}
              </span>
            </div>
            <table className="w-full table-fixed text-left">
              {/* Fixed widths so columns don't shift as rows update during recording */}
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[22%]" />
                <col className="w-[24%]" />
                <col className="w-[8%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 font-medium">Repository</th>
                  <th className="px-4 py-3 font-medium">Pipeline</th>
                  <th className="px-4 py-3 font-medium">Affected code</th>
                  <th className="px-4 py-3 text-right font-medium">Time</th>
                  <th className="px-6 py-3 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((r) => (
                  <RepoRow
                    key={r.repo}
                    r={r}
                    now={now}
                    expanded={expanded === r.repo}
                    onToggle={() => setExpanded(expanded === r.repo ? null : r.repo)}
                  />
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Footer summary */}
        {run && (
          <section className={cn(
            "flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border px-6 py-5 text-lg transition-colors duration-500",
            run.done ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-white/[0.06] bg-white/[0.01]",
          )}>
            <Stat value={totals.checked} label="repos checked" />
            <Dot />
            <Stat value={totals.prs} label={totals.prs === 1 ? "PR opened" : "PRs opened"} className="text-emerald-400" />
            <Dot />
            <Stat value={totals.skipped} label="not affected" className="text-slate-300" />
            <Dot />
            <Stat value={totals.rejected} label="rejected" className={totals.rejected ? "text-rose-400" : "text-slate-300"} />
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span className="text-slate-400">
      <NumberTicker value={value} className={cn("mr-1.5 text-2xl font-semibold text-white", className)} />
      {label}
    </span>
  );
}

function Dot() {
  return <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />;
}

function RepoRow({ r, now, expanded, onToggle }: { r: RepoState; now: number; expanded: boolean; onToggle: () => void }) {
  const elapsed = r.startedAt ? (r.finishedAt ?? now) - r.startedAt : 0;
  return (
    <Fragment>
      <tr
        onClick={onToggle}
        className={cn("cursor-pointer border-t border-white/[0.05] align-top transition-colors hover:bg-white/[0.025]", expanded && "bg-white/[0.025]")}
      >
        <td className="px-6 py-5">
          <div className="flex items-center gap-2.5">
            <GithubIcon className="h-4 w-4 flex-none text-slate-400" />
            <span className="font-medium text-white">{r.repo}</span>
            <ChevronDown className={cn("h-4 w-4 text-slate-600 transition-transform", expanded && "rotate-180")} />
          </div>
          <p
            title={r.message}
            className={cn("mt-1.5 break-words pl-6 text-sm", r.retrying ? "text-amber-300" : r.stage === "error" || r.stage === "rejected" ? "text-rose-300" : "text-slate-500")}
          >
            {r.message ? firstLine(r.message) : "Queued"}
          </p>
        </td>
        <td className="px-4 py-5">
          {r.skipped ? <NotAffectedPill /> : <Stepper steps={r.steps} retrying={r.retrying} />}
        </td>
        <td className="px-4 py-5">
          <div className="flex max-w-[280px] flex-wrap gap-1.5">
            {r.matches.map((m) => (
              <code key={`${m.file}:${m.line}`} title={m.text} className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-xs text-slate-300">
                {m.file}:{m.line}
              </code>
            ))}
            {r.matches.length === 0 && <span className="text-sm text-slate-600">{r.steps.scan === "done" ? "None" : "…"}</span>}
          </div>
        </td>
        <td className="px-4 py-5 text-right font-mono text-sm tabular-nums text-slate-400">{r.startedAt ? formatElapsed(elapsed) : "–"}</td>
        <td className="min-w-0 break-words px-6 py-5 text-right">
          <Result r={r} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-black/30">
          <td colSpan={5} className="px-6 pb-5 pt-1">
            <pre className="max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-black/60 p-4 font-mono text-[13px] leading-relaxed text-slate-300">
              {r.testOutput ? r.testOutput.split("\n").slice(-30).join("\n") : r.skipped ? "No matching code. Nothing to fix, nothing to test." : "No test output yet."}
            </pre>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function NotAffectedPill() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-500/25 bg-slate-500/10 px-3.5 py-1.5 text-sm text-slate-300">
      <CircleSlash className="h-4 w-4 text-slate-400" />
      Not affected: skipped
    </span>
  );
}

function Stepper({ steps, retrying }: { steps: Record<StepKey, StepStatus>; retrying: boolean }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && (
            <div className="relative mx-1 h-px w-6 bg-white/10">
              <div className={cn("absolute inset-y-0 left-0 bg-emerald-500/70 transition-all duration-500", steps[STEPS[i - 1].key] === "done" ? "w-full" : "w-0")} />
            </div>
          )}
          <StepDot label={s.label} status={steps[s.key]} retrying={retrying && s.key === "test"} />
        </Fragment>
      ))}
    </div>
  );
}

function StepDot({ label, status, retrying }: { label: string; status: StepStatus; retrying: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-300",
        status === "pending" && "border-white/10 bg-white/[0.02]",
        status === "active" && (retrying ? "border-amber-400/60 bg-amber-400/10" : "border-indigo-400/60 bg-indigo-400/10"),
        status === "done" && "border-emerald-500/60 bg-emerald-500/15",
        status === "failed" && "border-rose-500/60 bg-rose-500/15",
      )}>
        {status === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />}
        {status === "active" && (retrying ? <RotateCw className="h-3.5 w-3.5 animate-spin text-amber-300" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-300" />)}
        {status === "done" && <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />}
        {status === "failed" && <X className="h-3.5 w-3.5 text-rose-400" strokeWidth={3} />}
      </div>
      <span className={cn("text-[11px] font-medium", status === "pending" ? "text-slate-600" : "text-slate-400")}>{label}</span>
    </div>
  );
}

function Result({ r }: { r: RepoState }) {
  if (r.prUrl) {
    return (
      <a
        href={r.prUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
      >
        <GitPullRequest className="h-4 w-4" /> View PR <ArrowRight className="h-4 w-4" />
      </a>
    );
  }
  if (r.stage === "rejected") {
    // The reason is in the row message; keep this cell compact so it never overflows the card.
    return <span title={r.rejectionReason} className="inline-flex items-center gap-1.5 text-sm text-rose-300"><X className="h-4 w-4 flex-none" /> Rejected</span>;
  }
  if (r.stage === "error") {
    return <span className="inline-flex items-center gap-1.5 text-sm text-rose-300"><X className="h-4 w-4" /> Error</span>;
  }
  if (r.skipped) return <span className="text-sm text-slate-500">No PR needed</span>;
  return <span className="text-sm text-slate-600">–</span>;
}
