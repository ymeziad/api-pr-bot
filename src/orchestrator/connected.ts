// Repos connected from the dashboard at runtime. In-memory on globalThis, like store.ts.
import type { RepoTarget } from "@/shared/types";
import { impl } from "./impl";

export type ListedRepo = RepoTarget & { source: "config" | "connected" };

const g = globalThis as unknown as { __connectedRepos?: Map<string, RepoTarget> };
const connected = (g.__connectedRepos ??= new Map<string, RepoTarget>());

export function listConnected(): RepoTarget[] {
  return [...connected.values()];
}

export function addConnected(repo: RepoTarget): void {
  connected.set(repo.name, repo);
}

export function removeConnected(name: string): boolean {
  return connected.delete(name);
}

/** Config repos first, then connected ones, de-duplicated by name. */
export function allRepos(): ListedRepo[] {
  const out = new Map<string, ListedRepo>();
  for (const r of impl().loadRepos()) out.set(r.name, { ...r, source: "config" });
  for (const r of listConnected()) if (!out.has(r.name)) out.set(r.name, { ...r, source: "connected" });
  return [...out.values()];
}
