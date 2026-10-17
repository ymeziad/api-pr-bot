import { NextResponse } from "next/server";
import type { ChangeSpec } from "@/shared/types";
import { impl } from "@/orchestrator/impl";
import { runChange } from "@/orchestrator/run";
import { appendEvent, createRun } from "@/orchestrator/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { spec } = (await req.json()) as { spec: ChangeSpec };
    const repos = impl().loadRepos();
    const runId = createRun(spec);
    // Fire and forget: the dashboard polls /api/runs/[id].
    runChange(spec, repos, (e) => appendEvent(runId, e), runId).catch((err) => console.error("runChange failed", err));
    return NextResponse.json({ runId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
