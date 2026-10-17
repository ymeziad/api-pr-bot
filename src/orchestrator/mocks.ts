// Fake versions of every teammate function, used when USE_MOCKS=true.
// Timings and events mirror the real pipeline so the dashboard can be built and recorded without keys.
import type { ChangeSpec, Emit, FixResult, Match, RepoTarget, ScanResult } from "@/shared/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

// Set MOCK_RETRY=false to skip the retry visual on bookly-api.
const SHOW_RETRY = process.env.MOCK_RETRY !== "false";

export const MOCK_SPECS: Record<string, ChangeSpec> = {
  "charges-to-paymentintents": {
    id: "charges-to-paymentintents",
    title: "Legacy Charges API is deprecated: migrate to PaymentIntents",
    summary:
      "stripe.charges.create is deprecated and will stop accepting new integrations. Create a PaymentIntent and confirm it instead; it supports SCA and 3D Secure out of the box.",
    type: "breaking",
    searchPatterns: ["stripe\\.charges\\.create\\(", "stripe\\.charges\\.retrieve\\("],
    migrationSteps: [
      "Replace stripe.charges.create({ amount, currency, source }) with stripe.paymentIntents.create({ amount, currency, payment_method, confirm: true }).",
      "Read the charge outcome from paymentIntent.status instead of charge.paid.",
      "Replace stripe.charges.retrieve(id) with stripe.paymentIntents.retrieve(id).",
      "Handle status \"requires_action\" by returning the client_secret to the frontend.",
    ],
    docsUrl: "https://docs.stripe.com/payments/payment-intents/migration/charges",
    exampleBefore: "const charge = await stripe.charges.create({ amount, currency: \"usd\", source: token });",
    exampleAfter:
      "const intent = await stripe.paymentIntents.create({ amount, currency: \"usd\", payment_method: pm, confirm: true });",
    verify: { mustNotMatch: ["stripe\\.charges\\."], mustMatch: ["stripe\\.paymentIntents\\."] },
  },
  "payment-intents-automatic-payment-methods": {
    id: "payment-intents-automatic-payment-methods",
    title: "PaymentIntents: enable automatic payment methods",
    summary:
      "PaymentIntents can now pick eligible payment methods from your Dashboard settings. Pass automatic_payment_methods: { enabled: true } instead of hard-coding payment_method_types.",
    type: "feature",
    searchPatterns: ["payment_method_types\\s*:"],
    migrationSteps: [
      "Remove payment_method_types from stripe.paymentIntents.create calls.",
      "Add automatic_payment_methods: { enabled: true }.",
    ],
    docsUrl: "https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods",
    verify: { mustNotMatch: ["payment_method_types\\s*:"], mustMatch: ["automatic_payment_methods"] },
  },
};

const MOCK_MATCHES: Record<string, Record<string, Match[]>> = {
  "charges-to-paymentintents": {
    "acme-shop": [
      { file: "src/checkout/charge.ts", line: 18, text: "const charge = await stripe.charges.create({" },
      { file: "src/orders/refund.ts", line: 42, text: "const original = await stripe.charges.retrieve(order.chargeId);" },
    ],
    "bookly-api": [
      { file: "src/billing/payments.ts", line: 27, text: "return stripe.charges.create({ amount, currency, source });" },
    ],
    "legacy-billing": [
      { file: "src/invoices.ts", line: 12, text: "const charge = await stripe.charges.create({" },
    ],
  },
  "payment-intents-automatic-payment-methods": {
    "bookly-api": [
      { file: "src/billing/intents.ts", line: 11, text: "payment_method_types: [\"card\"]," },
    ],
  },
};

export function loadRepos(): RepoTarget[] {
  return ["acme-shop", "bookly-api", "notes-app", "legacy-billing"].map((name) => ({
    owner: "demo",
    name,
    defaultBranch: "main",
    cloneUrl: `https://github.com/demo/${name}.git`,
  }));
}

export async function loadCachedSpec(id: string): Promise<ChangeSpec> {
  await sleep(400);
  const spec = MOCK_SPECS[id];
  if (!spec) throw new Error(`No cached spec "${id}"`);
  return spec;
}

export async function compileChange(input: { url?: string; text?: string }): Promise<ChangeSpec> {
  await sleep(1500);
  const blob = `${input.url ?? ""} ${input.text ?? ""}`.toLowerCase();
  return blob.includes("automatic") ? MOCK_SPECS["payment-intents-automatic-payment-methods"] : MOCK_SPECS["charges-to-paymentintents"];
}

export async function scanRepo(repo: RepoTarget, spec: ChangeSpec): Promise<ScanResult> {
  await sleep(jitter(1500, 2500));
  const matches = MOCK_MATCHES[spec.id]?.[repo.name] ?? [];
  return { repo, affected: matches.length > 0, matches };
}

function fakeTestOutput(repo: string, passed: boolean) {
  return [
    `> ${repo}@1.0.0 test`,
    "> vitest run",
    "",
    ` ✓ test/checkout.test.ts (4 tests) 38ms`,
    passed ? ` ✓ test/payments.test.ts (6 tests) 51ms` : ` ✗ test/payments.test.ts (6 tests | 1 failed) 49ms`,
    "",
    passed ? " Test Files  2 passed (2)" : " Test Files  1 failed | 1 passed (2)",
    passed ? "      Tests  10 passed (10)" : "      Tests  1 failed | 9 passed (10)",
  ].join("\n");
}

export async function fixRepo(args: { repo: RepoTarget; spec: ChangeSpec; scan: ScanResult; emit: Emit }): Promise<FixResult> {
  const { repo, scan, emit } = args;
  const name = repo.name;
  const retry = SHOW_RETRY && name === "bookly-api";

  emit({ repo: name, stage: "fixing", message: "Booting sandbox VM, cloning repo" });
  await sleep(jitter(2500, 3500));
  emit({ repo: name, stage: "fixing", message: `Claude Code editing ${scan.matches.length} location(s)` });
  await sleep(jitter(5000, 7000));
  emit({ repo: name, stage: "testing", message: "Running typecheck + tests" });
  await sleep(jitter(3000, 4000));

  // legacy-billing's tests are pinned to the old Charges API, so no correct migration can pass: the gate rejects it.
  if (name === "legacy-billing") {
    const failing = [
      "> legacy-billing@1.0.0 test",
      "> vitest run",
      "",
      " ✗ test/invoices.test.ts (3 tests | 2 failed) 44ms",
      "   AssertionError: expected stripe.charges.create to be called",
      "",
      " Test Files  1 failed (1)",
      "      Tests  2 failed | 1 passed (3)",
    ].join("\n");
    emit({ repo: name, stage: "retrying", message: "Retrying: tests failed, feeding output back to Claude", testOutput: failing });
    await sleep(jitter(4000, 5000));
    emit({ repo: name, stage: "testing", message: "Running typecheck + tests (attempt 2)" });
    await sleep(jitter(2500, 3500));
    return {
      status: "rejected",
      diff: "",
      changedFiles: [...new Set(scan.matches.map((m) => m.file))],
      testOutput: failing,
      typecheckOutput: "tsc --noEmit: 0 errors",
      attempts: 2,
      rejectionReason: "tests failed: test/invoices.test.ts asserts stripe.charges.create was called (tests are pinned to the old API)",
    };
  }

  let attempts = 1;
  if (retry) {
    emit({ repo: name, stage: "retrying", message: "Retrying: 1 test failed, feeding output back to Claude", testOutput: fakeTestOutput(name, false) });
    await sleep(jitter(4000, 5000));
    emit({ repo: name, stage: "testing", message: "Running typecheck + tests (attempt 2)" });
    await sleep(jitter(2500, 3500));
    attempts = 2;
  }

  const testOutput = fakeTestOutput(name, true);
  emit({ repo: name, stage: "passed", message: "Typecheck clean · all tests passed · tests untouched", testOutput });
  return {
    status: "passed",
    diff: "",
    changedFiles: [...new Set(scan.matches.map((m) => m.file))],
    testOutput,
    typecheckOutput: "tsc --noEmit: 0 errors",
    attempts,
  };
}

export async function openPullRequest(args: { repo: RepoTarget; spec: ChangeSpec; scan: ScanResult; fix: FixResult }): Promise<string> {
  await sleep(jitter(1500, 2000));
  return `https://github.com/${args.repo.owner}/${args.repo.name}/pull/1`;
}
