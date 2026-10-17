import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ChangeSpec } from "../shared/types";

const MAX_DOC_CHARS = 40_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SpecSchema = z.object({
  id: z.string().describe("kebab-case slug, e.g. charges-to-paymentintents"),
  title: z.string(),
  summary: z.string().describe("Plain English, 1-3 sentences, for a developer audience"),
  type: z.enum(["breaking", "feature"]),
  searchPatterns: z.array(z.string()),
  migrationSteps: z.array(z.string()),
  docsUrl: z.string(),
  exampleBefore: z.string(),
  exampleAfter: z.string(),
  verify: z.object({ mustNotMatch: z.array(z.string()), mustMatch: z.array(z.string()) }),
});

const SYSTEM = `You turn an API provider's changelog or migration guide into a machine-readable ChangeSpec that an automated bot uses to find and fix affected code in customer repositories (TypeScript/JavaScript using the provider's official Node SDK).

Field rules:
- id: short kebab-case slug describing the change.
- type: "breaking" if existing code must change (deprecation, removal, behavior change); "feature" if it is a new opt-in capability customers should adopt.
- summary: plain English, 1-3 sentences, no marketing language.
- searchPatterns: JavaScript RegExp source strings (as passed to new RegExp) that match a single line of CALLING CODE in a customer repo, e.g. "stripe\\\\.charges\\\\.create\\\\(" or "\\\\.charges\\\\.create\\\\(". Match SDK method calls, not documentation prose. Escape dots and parentheses. Include one specific and one looser variant.
- migrationSteps: concrete, ordered code edits a developer (or coding agent) should make. Name exact parameters.
- verify.mustNotMatch: regex sources that must NOT appear in non-test source after a correct fix (for breaking changes, usually the old call). verify.mustMatch: regex sources that MUST appear after the fix (for features, usually the new parameter). Use an empty array when not applicable.
- exampleBefore / exampleAfter: short TypeScript snippets showing the old and new code.
- docsUrl: the canonical documentation URL for this change. Prefer the source URL if one is given; never invent URLs.`;

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchDoc(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "api-pr-bot/0.1" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return htmlToText(await res.text()).slice(0, MAX_DOC_CHARS);
}

export function validateSpec(spec: ChangeSpec): string[] {
  const errors: string[] = [];
  if (!SLUG.test(spec.id)) errors.push(`id "${spec.id}" is not a kebab-case slug`);
  for (const field of ["title", "summary", "docsUrl"] as const) {
    if (!spec[field]?.trim()) errors.push(`${field} is empty`);
  }
  if (spec.type !== "breaking" && spec.type !== "feature") errors.push(`type must be breaking or feature`);
  if (!spec.searchPatterns?.length) errors.push("searchPatterns is empty");
  if (!spec.migrationSteps?.length) errors.push("migrationSteps is empty");
  const regexes = [...(spec.searchPatterns ?? []), ...(spec.verify?.mustMatch ?? []), ...(spec.verify?.mustNotMatch ?? [])];
  for (const source of regexes) {
    try {
      new RegExp(source);
    } catch (err) {
      errors.push(`invalid regex ${JSON.stringify(source)}: ${(err as Error).message}`);
    }
  }
  return errors;
}

function normalize(raw: z.infer<typeof SpecSchema>): ChangeSpec {
  const verify: ChangeSpec["verify"] = {};
  if (raw.verify.mustMatch.length) verify.mustMatch = raw.verify.mustMatch;
  if (raw.verify.mustNotMatch.length) verify.mustNotMatch = raw.verify.mustNotMatch;
  return {
    ...raw,
    summary: raw.summary.trim(),
    exampleBefore: raw.exampleBefore || undefined,
    exampleAfter: raw.exampleAfter || undefined,
    verify: Object.keys(verify).length ? verify : undefined,
  };
}

export async function compileChange(input: { url?: string; text?: string }): Promise<ChangeSpec> {
  let doc = input.text?.trim() ?? "";
  if (input.url) {
    try {
      const fetched = await fetchDoc(input.url);
      doc = doc ? `${doc}\n\n--- Page content from ${input.url} ---\n${fetched}` : fetched;
    } catch (err) {
      if (!doc) throw new Error(`Could not fetch ${input.url}: ${(err as Error).message}`);
    }
  }
  if (!doc) throw new Error("compileChange needs a url or text");

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${input.url ? `Source URL: ${input.url}\n\n` : ""}Change description:\n<change>\n${doc}\n</change>\n\nProduce the ChangeSpec.`,
    },
  ];

  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.parse({
      model,
      max_tokens: 8000,
      system: SYSTEM,
      messages,
      output_config: { effort: "low", format: zodOutputFormat(SpecSchema) },
    });
    if (response.stop_reason === "refusal") throw new Error("Model declined to compile this change");
    const parsed = response.parsed_output;
    lastErrors = parsed ? validateSpec(normalize(parsed)) : ["response did not match the ChangeSpec schema"];
    if (parsed && lastErrors.length === 0) return normalize(parsed);

    messages.push(
      { role: "assistant", content: response.content },
      { role: "user", content: `That ChangeSpec failed validation:\n- ${lastErrors.join("\n- ")}\nFix these problems and produce the full ChangeSpec again.` },
    );
  }
  throw new Error(`Compiled ChangeSpec failed validation: ${lastErrors.join("; ")}`);
}

export function loadCachedSpec(id: string): ChangeSpec {
  if (!SLUG.test(id)) throw new Error(`Invalid spec id: ${id}`);
  const path = join(process.cwd(), "config", "specs", `${id}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as ChangeSpec;
}
