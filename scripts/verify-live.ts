/**
 * Live smoke test of the five model-backed endpoints. `pnpm verify:live`.
 *
 * Deliberately not part of `pnpm test`, and not in CI: it spends real money and
 * needs a real ANTHROPIC_API_KEY in .env.local. The unit suite covers everything
 * provable without a key; this covers the rest.
 *
 * It drives the app's own modules — buildContext, shapeRequest, callStructured,
 * callText, callTestRun — rather than hand-rolled requests, so what passes here
 * is what ships. Two things it exists to answer, neither settleable from docs:
 *
 *   1. Whether `output_config.format` and `fallbacks: "default"` compose on the
 *      beta endpoint, or one rejects the other.
 *   2. Whether the two cache breakpoints actually produce a non-zero
 *      cache_read_input_tokens on a second identical call.
 *
 * Expect roughly $0.50 a run.
 */
import { callStructured, callText, callTestRun } from "@/lib/claude/call";
import { buildContext, buildTestRunBlocks, countBreakpoints } from "@/lib/claude/context";
import {
  CHECKLIST_INSTRUCTION,
  COMPILE_STRUCTURED_INSTRUCTION,
  GRADE_INSTRUCTION,
  REVIEW_INSTRUCTION,
  gradePayload,
} from "@/lib/claude/prompts";
import { ChecklistSchema, GradeSchema, ReviewSchema } from "@/lib/claude/schemas";
import type { Brief } from "@/lib/brief";
import { ENDPOINT_MODEL, MODEL_CAPS } from "@/lib/config";

// A brief deliberately long enough to clear the largest cache minimum in play
// (4096 tokens on Haiku 4.5). A shorter one would make a "no cache read" result
// ambiguous: silently below threshold looks identical to genuinely broken.
const filler = (label: string, n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `${label} item ${i + 1}: every measurement, colour value and copy string below is exact and must survive into the finished prompt without being rounded, paraphrased or summarised away.`,
  ).join(" ");

const brief: Brief = {
  who_asking:
    "I am the senior product designer at Sykon Properties in Dubai, and I own the design system plus every screen that ships to our brokers. " +
    filler("Role", 12),
  context:
    "This goes to two front-end engineers and to our accessibility reviewer, so it has to be exact. We are shipping in three weeks. " +
    filler("Context", 12),
  what_needed:
    "A single property listing card component spec, covering default, hover, and sold-out states. " +
    filler("Deliverable", 12),
  requirements:
    "Heading is 32px. Body is 16px. Card radius is 12px. Price renders as AED 4,200,000 exactly, never abbreviated. Contrast must meet WCAG AA. " +
    filler("Requirement", 12),
  style_brand:
    "Brand charcoal is #1A1A1A, accent gold is #C9A227, background is pure white #FFFFFF. Typeface is SF Pro. No gradients anywhere. " +
    filler("Brand", 12),
  format_specs:
    "Deliver as a single Markdown document with one H2 per state and a props table. Under 900 words. " +
    filler("Format", 12),
};

const context = { brief, attachments: [], sector: "real estate", jobTitle: "product designer", draftPrompt: "Design me a property card." };

type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
const n = (v: number | null | undefined) => v ?? 0;

const results: Array<{ name: string; ok: boolean; note: string }> = [];

function report(name: string, usage: Usage, model: string, costUsd: number, extra = "") {
  const write = n(usage.cache_creation_input_tokens);
  const read = n(usage.cache_read_input_tokens);
  console.log(
    `  ${name.padEnd(22)} model=${model.padEnd(18)} in=${String(n(usage.input_tokens)).padStart(6)} out=${String(n(usage.output_tokens)).padStart(5)} cache_write=${String(write).padStart(6)} cache_read=${String(read).padStart(6)} $${costUsd.toFixed(4)} ${extra}`,
  );
  return { write, read };
}

function record(name: string, ok: boolean, note: string) {
  results.push({ name, ok, note });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} — ${note}\n`);
}

async function main() {
  const blocks = buildContext(context);
  const approxChars = blocks.reduce((sum, b) => sum + (b.type === "text" ? b.text.length : 0), 0);
  console.log(`\nContext: ${blocks.length} blocks, ${countBreakpoints(blocks)} breakpoints, ~${approxChars} chars (~${Math.round(approxChars / 3.6)} tokens)`);
  console.log(`Cache minimums: ${Object.entries(MODEL_CAPS).map(([m, c]) => `${m}=${c.cacheMinTokens}`).join(" ")}\n`);

  // --- Q1: does output_config.format compose with fallbacks: "default"? ---
  console.log("Q1 — structured outputs + fallbacks:'default' + adaptive thinking + effort (Opus 5)");
  const review1 = await callStructured({ endpoint: "review", blocks, instruction: REVIEW_INSTRUCTION, schema: ReviewSchema });
  const c1 = report("review (cold)", review1.usage, review1.model, review1.costUsd);
  record(
    "Q1 structured+fallbacks compose",
    true,
    `no 400; schema validated, ${review1.data.brief.criteria.length} brief criteria returned`,
  );

  // --- Q2: does a second identical call read from cache? ---
  console.log("Q2 — cache read on an identical second call (same model, same prefix)");
  const review2 = await callStructured({ endpoint: "review", blocks, instruction: REVIEW_INSTRUCTION, schema: ReviewSchema });
  const c2 = report("review (warm)", review2.usage, review2.model, review2.costUsd);
  record(
    "Q2 cache_read_input_tokens > 0",
    c2.read > 0,
    c2.read > 0
      ? `${c2.read} tokens read from cache (cold call wrote ${c1.write})`
      : `still 0 after a cold write of ${c1.write} — breakpoints are not producing a reusable prefix`,
  );

  // --- Remaining endpoints: each exercises a different per-model omission ---
  console.log("Per-endpoint shapes");

  const checklist = await callStructured({ endpoint: "checklist", blocks, instruction: CHECKLIST_INSTRUCTION(10), schema: ChecklistSchema });
  report("checklist", checklist.usage, checklist.model, checklist.costUsd);
  record("checklist (Sonnet 5, structured)", checklist.data.items.length > 0, `${checklist.data.items.length} items`);

  const compile = await callText({ endpoint: "compile", blocks, instruction: COMPILE_STRUCTURED_INSTRUCTION });
  report("compile", compile.usage, compile.model, compile.costUsd);
  record("compile (Opus 5, streamed text)", compile.data.length > 200, `${compile.data.length} chars of prompt text`);

  const testBlocks = buildTestRunBlocks({ attachments: [], compiledPrompt: compile.data });
  const testRun = await callTestRun({ blocks: testBlocks });
  report("testRun", testRun.usage, testRun.model, testRun.costUsd);
  record("testRun (no system prompt)", testRun.data.length > 200, `${testRun.data.length} chars of output`);

  const items = checklist.data.items;
  const grade = await callStructured({
    endpoint: "grade",
    blocks,
    instruction: GRADE_INSTRUCTION + gradePayload({ items, output: testRun.data }),
    schema: GradeSchema,
  });
  const cg = report("grade", grade.usage, grade.model, grade.costUsd);
  record(
    `grade (Haiku 4.5, no effort/thinking)`,
    grade.data.results.length > 0,
    `${grade.data.results.length}/${items.length} verdicts; cache_write=${cg.write} (min ${MODEL_CAPS[ENDPOINT_MODEL.grade].cacheMinTokens})`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAIL ${f.name}: ${f.note}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nVERIFICATION ERROR:", err?.constructor?.name, err?.message);
  if (err?.status) console.error("  HTTP status:", err.status);
  if (err?.error) console.error("  API error:", JSON.stringify(err.error));
  process.exitCode = 1;
});
