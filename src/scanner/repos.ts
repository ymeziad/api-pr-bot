import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoTarget } from "../shared/types";

export function loadRepos(): RepoTarget[] {
  const path = join(process.cwd(), "config", "repos.json");
  return JSON.parse(readFileSync(path, "utf8")) as RepoTarget[];
}
