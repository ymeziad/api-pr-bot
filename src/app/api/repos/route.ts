import { NextResponse } from "next/server";
import type { RepoTarget } from "@/shared/types";
import { impl, mocksEnabled } from "@/orchestrator/impl";
import { addConnected, allRepos, removeConnected } from "@/orchestrator/connected";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const GITHUB_URL = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

export async function GET() {
  return NextResponse.json(allRepos());
}

export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const m = GITHUB_URL.exec(url?.trim() ?? "");
  if (!m) return bad("Enter a GitHub repo URL like https://github.com/<owner>/<name>.");
  const [, owner, name] = m;

  const owners = [...new Set(impl().loadRepos().map((r) => r.owner))];
  if (!owners.some((o) => o.toLowerCase() === owner.toLowerCase())) {
    return bad(`Shipfix can only open PRs in repos it has write access to. Connect a repo under github.com/${owners.join(", github.com/")}.`);
  }
  if (allRepos().some((r) => r.name === name)) return bad(`${name} is already connected.`, 409);

  if (!mocksEnabled()) {
    let pkg: { scripts?: Record<string, string> } | null = null;
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/package.json`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (res.ok) pkg = await res.json();
    } catch {
      pkg = null;
    }
    if (!pkg) return bad(`Couldn't read package.json from ${owner}/${name}. Is the repo public, with a package.json at its root?`);
    if (!pkg.scripts?.typecheck || !pkg.scripts?.test) {
      return bad(`${owner}/${name} needs \`typecheck\` and \`test\` scripts so Shipfix can verify fixes.`);
    }
  }

  const repo: RepoTarget = { owner, name, defaultBranch: "main", cloneUrl: `https://github.com/${owner}/${name}.git` };
  addConnected(repo);
  return NextResponse.json(allRepos());
}

export async function DELETE(req: Request) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  const repo = allRepos().find((r) => r.name === name);
  if (!repo) return bad(`${name ?? "That repo"} isn't connected.`, 404);
  if (repo.source === "config") return bad(`${repo.name} comes from config/repos.json and can't be removed here.`);
  removeConnected(repo.name);
  return NextResponse.json(allRepos());
}
