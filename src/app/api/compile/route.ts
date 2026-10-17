import { NextResponse } from "next/server";
import { impl } from "@/orchestrator/impl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { url, text, cachedId } = (await req.json()) as { url?: string; text?: string; cachedId?: string };
    const { compileChange, loadCachedSpec } = impl();
    const spec = cachedId ? await loadCachedSpec(cachedId) : await compileChange({ url, text });
    return NextResponse.json(spec);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
