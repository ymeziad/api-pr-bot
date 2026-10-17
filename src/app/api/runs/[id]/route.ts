import { NextResponse } from "next/server";
import { getRun } from "@/orchestrator/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  return NextResponse.json(run);
}
