// Close every open api-pr-bot/* PR and delete those branches in all demo repos.
// Usage: npx tsx scripts/reset-demo.ts
import "../src/lib/env";
import { Octokit } from "@octokit/rest";
import { requireGithubToken } from "../src/lib/git";
import { BRANCH_PREFIX } from "../src/pr";
import { loadRepos } from "../src/scanner/repos";

const octokit = new Octokit({ auth: await requireGithubToken() });

await Promise.all(
  loadRepos().map(async ({ owner, name }) => {
    const prs = await octokit.paginate(octokit.pulls.list, { owner, repo: name, state: "open", per_page: 100 });
    const botPrs = prs.filter((pr) => pr.head.ref.startsWith(BRANCH_PREFIX));
    await Promise.all(
      botPrs.map((pr) => octokit.pulls.update({ owner, repo: name, pull_number: pr.number, state: "closed" })),
    );

    const { data: refs } = await octokit.git.listMatchingRefs({ owner, repo: name, ref: `heads/${BRANCH_PREFIX}` });
    await Promise.all(
      refs.map((r) =>
        octokit.git.deleteRef({ owner, repo: name, ref: r.ref.replace(/^refs\//, "") }).catch((err) => {
          if (err.status !== 422 && err.status !== 404) throw err; // already gone
        }),
      ),
    );
    console.log(`${name}: closed ${botPrs.length} PR(s), deleted ${refs.length} branch(es)`);
  }),
);
console.log("Demo reset complete.");
