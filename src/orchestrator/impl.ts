// Picks real teammate implementations or mocks based on USE_MOCKS.
import * as mocks from "./mocks";
import { compileChange, loadCachedSpec } from "@/compiler";
import { scanRepo } from "@/scanner";
import { loadRepos } from "@/scanner/repos";
import { openPullRequest } from "@/pr";
import { fixRepo } from "@/fixer";
import { mocksEnabled } from "./mode";

export { mocksEnabled };

let warned = false;

export function impl() {
  if (mocksEnabled()) {
    if (!warned) {
      console.warn('[orchestrator] USE_MOCKS is not "false": using MOCK implementations');
      warned = true;
    }
    return mocks;
  }
  return { compileChange, loadCachedSpec, scanRepo, loadRepos, openPullRequest, fixRepo };
}
