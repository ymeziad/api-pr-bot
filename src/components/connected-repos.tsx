"use client";
// "Connect a repository": shows which repos a run will cover and lets a demo add one more.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { ListedRepo } from "@/orchestrator/connected";
import { GithubIcon } from "@/components/github-icon";

export function ConnectedRepos() {
  const [repos, setRepos] = useState<ListedRepo[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (init?: RequestInit) => {
    setError(null);
    try {
      const res = await fetch("/api/repos", { cache: "no-store", ...init, headers: { "content-type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setRepos(data);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  useEffect(() => { call(); }, [call]);

  const connect = async () => {
    if (!url.trim()) return;
    setBusy(true);
    if (await call({ method: "POST", body: JSON.stringify({ url: url.trim() }) })) setUrl("");
    setBusy(false);
  };

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] px-6 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="mr-1 whitespace-nowrap text-sm font-medium text-slate-400">Connected repositories</span>
          {repos.map((r) => (
            <span key={r.name} title={`${r.owner}/${r.name}`} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] py-1 pl-2.5 pr-2.5 text-sm text-slate-300">
              <GithubIcon className="h-3.5 w-3.5 text-slate-500" />
              {r.name}
              {r.source === "connected" && (
                <button
                  onClick={() => call({ method: "DELETE", body: JSON.stringify({ name: r.name }) })}
                  aria-label={`Remove ${r.name}`}
                  className="-mr-1 rounded-full p-0.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="flex w-full gap-2 lg:w-[340px] lg:flex-none">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
            placeholder="https://github.com/owner/repo"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none"
          />
          <button
            onClick={connect}
            disabled={!url.trim() || busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.1] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Connect
          </button>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
    </section>
  );
}
