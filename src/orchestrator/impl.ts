// Picks real teammate implementations or mocks based on USE_MOCKS.
import * as mocks from "./mocks";
import { compileChange, loadCachedSpec } from "@/compiler";
import { scanRepo } from "@/scanner";
import { loadRepos } from "@/scanner/repos";
import { openPullRequest } from "@/pr";
import { fixRepo } from "@/fixer";

export const mocksEnabled = () => process.env.USE_MOCKS !== "false";

export function impl() {
  if (mocksEnabled()) return mocks;
  return { compileChange, loadCachedSpec, scanRepo, loadRepos, openPullRequest, fixRepo };
}
