import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_BRIEF, type Brief } from "@/lib/brief";
import { ENDPOINT_MAX_TOKENS, ENDPOINT_MODEL, MODEL_CAPS } from "@/lib/config";
import type { Endpoint } from "@/lib/config";
import {
  buildContext,
  citesFiles,
  countBreakpoints,
  type ContextAttachment,
} from "@/lib/claude/context";
import { SHARED_SYSTEM, maxTokensExceedsModel, shapeRequest } from "@/lib/claude/request";

const ENDPOINTS: Endpoint[] = ["review", "checklist", "compile", "testRun", "grade"];

const brief: Brief = {
  ...EMPTY_BRIEF,
  who_asking: "I am the property consultant at Sykon.",
  context: "This goes to a buyer who has already viewed the unit.",
  what_needed: "A 6-page PDF brochure.",
  requirements: 'Price shown as "AED 4,200,000" exactly.',
  style_brand: "Monochrome, editorial.",
  // format_specs intentionally left blank to test the blank marker
};

function attachment(over: Partial<ContextAttachment> = {}): ContextAttachment {
  return {
    filename: "plans.pdf",
    mime: "application/pdf",
    role: "input",
    anthropic_file_id: "file_abc",
    extracted_text: null,
    extraction_status: "not_needed",
    description: null,
    ...over,
  };
}

const ctx = (attachments: ContextAttachment[] = []) =>
  buildContext({
    brief,
    attachments,
    sector: "Real Estate",
    jobTitle: "Property Consultant",
    draftPrompt: "Hey, I need a brochure for this villa.",
  });

// ---------------------------------------------------------------------------
// context.ts
// ---------------------------------------------------------------------------

test("attachments precede the brief, so a brief edit keeps the file prefix cached", () => {
  const blocks = ctx([attachment()]);
  const fileIndex = blocks.findIndex((b) => b.type === "document");
  const briefIndex = blocks.findIndex(
    (b) => b.type === "text" && b.text.includes("Who's asking"),
  );
  assert.ok(fileIndex >= 0 && briefIndex >= 0);
  assert.ok(fileIndex < briefIndex, "files must come before the brief");
});

test("PDF becomes a document block, PNG an image block", () => {
  const pdf = ctx([attachment()]).find((b) => b.type === "document");
  assert.equal(pdf?.type, "document");

  const png = ctx([
    attachment({ filename: "shot.png", mime: "image/png", anthropic_file_id: "file_png" }),
  ]).find((b) => b.type === "image");
  assert.equal(png?.type, "image");
});

test("SVG is sent as text, never as an image — Claude vision rejects SVG", () => {
  const blocks = ctx([
    attachment({
      filename: "logo.svg",
      mime: "image/svg+xml",
      anthropic_file_id: "file_svg",
    }),
  ]);
  assert.equal(
    blocks.some((b) => b.type === "image"),
    false,
    "SVG must not become an image block",
  );
  assert.ok(blocks.some((b) => b.type === "document" || b.type === "text"));
});

test("extracted text is wrapped so the model can tell files apart", () => {
  const blocks = ctx([
    attachment({
      filename: "shift-data.csv",
      mime: "text/csv",
      anthropic_file_id: null,
      extracted_text: "staff,day\nAmina,Tue",
      extraction_status: "ok",
    }),
  ]);
  const wrapped = blocks.find(
    (b) => b.type === "text" && b.text.includes('<file name="shift-data.csv"'),
  );
  assert.ok(wrapped, "expected a <file> wrapper");
  assert.ok(
    wrapped.type === "text" && wrapped.text.includes("Amina"),
    "contents should be inside the wrapper",
  );
});

test("an unreadable file is declared unavailable rather than guessed at", () => {
  const blocks = ctx([
    attachment({
      filename: "archive.zip",
      mime: "application/zip",
      anthropic_file_id: null,
      extracted_text: null,
      extraction_status: "unsupported",
    }),
  ]);
  const marker = blocks.find(
    (b) => b.type === "text" && b.text.includes('contents="unavailable"'),
  );
  assert.ok(marker, "must mark contents unavailable");
  assert.ok(
    marker.type === "text" && marker.text.includes("archive.zip"),
    "must still name the file",
  );
});

test("excluded files get an explicit do-not-use block", () => {
  const blocks = ctx([
    attachment(),
    attachment({
      filename: "tokens-LEGACY.csv",
      role: "excluded",
      anthropic_file_id: null,
      extracted_text: "old",
      extraction_status: "ok",
    }),
  ]);
  const block = blocks.find(
    (b) => b.type === "text" && b.text.includes("must NOT be used"),
  );
  assert.ok(block, "expected a do-not-use block");
  assert.ok(block.type === "text" && block.text.includes("tokens-LEGACY.csv"));
});

test("excluded file contents are never sent as readable material", () => {
  const blocks = ctx([
    attachment({
      filename: "tokens-LEGACY.csv",
      role: "excluded",
      anthropic_file_id: null,
      extracted_text: "SECRET_OLD_VALUE",
      extraction_status: "ok",
    }),
  ]);
  assert.equal(
    blocks.some((b) => b.type === "text" && b.text.includes("SECRET_OLD_VALUE")),
    false,
    "an excluded file's contents must not be inlined",
  );
});

test("two breakpoints with attachments, one without, never over the limit of four", () => {
  assert.equal(countBreakpoints(ctx([attachment()])), 2);
  assert.equal(countBreakpoints(ctx([])), 1);
  const many = ctx(
    Array.from({ length: 10 }, (_, i) =>
      attachment({ filename: `f${i}.pdf`, anthropic_file_id: `file_${i}` }),
    ),
  );
  assert.ok(countBreakpoints(many) <= 4, "max 4 breakpoints per request");
});

test("the brief block carries the final breakpoint", () => {
  const blocks = ctx([attachment()]);
  const last = blocks[blocks.length - 1];
  assert.ok(last.type === "text" && last.text.includes("Who's asking"));
  assert.deepEqual(last.cache_control, { type: "ephemeral" });
});

test("citesFiles gates the Files beta correctly", () => {
  assert.equal(citesFiles(ctx([attachment()])), true);
  assert.equal(citesFiles(ctx([])), false);
  assert.equal(
    citesFiles(
      ctx([
        attachment({
          anthropic_file_id: null,
          extracted_text: "x",
          extraction_status: "ok",
        }),
      ]),
    ),
    false,
    "text-only attachments cite no file_id",
  );
});

test("all six brief boxes appear, and a blank one is marked blank", () => {
  const text = ctx()
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  for (const label of [
    "Who's asking",
    "Context",
    "What you need made",
    "Requirements",
    "Style & brand",
    "Format & specs",
  ]) {
    assert.ok(text.includes(label), `missing box: ${label}`);
  }
  assert.ok(text.includes("(left blank)"), "blank box should be flagged");
});

// ---------------------------------------------------------------------------
// request.ts — every assertion here prevents a 400
// ---------------------------------------------------------------------------

test("grade omits effort AND thinking, because Haiku 4.5 rejects both", () => {
  const req = shapeRequest({ endpoint: "grade", blocks: ctx(), instruction: "go" });
  assert.equal(req.model, "claude-haiku-4-5");
  assert.equal(req.thinking, undefined, "thinking must be absent, not disabled");
  assert.equal(
    req.output_config?.effort,
    undefined,
    "effort must be absent, not defaulted",
  );
});

test("review sends adaptive thinking and high effort on Opus 5", () => {
  const req = shapeRequest({ endpoint: "review", blocks: ctx(), instruction: "go" });
  assert.equal(req.model, "claude-opus-5");
  assert.deepEqual(req.thinking, { type: "adaptive" });
  assert.equal(req.output_config?.effort, "high");
});

test("checklist runs on Sonnet 5 at medium effort", () => {
  const req = shapeRequest({ endpoint: "checklist", blocks: ctx(), instruction: "go" });
  assert.equal(req.model, "claude-sonnet-5");
  assert.equal(req.output_config?.effort, "medium");
  assert.deepEqual(req.thinking, { type: "adaptive" });
});

test("refusal fallback is always on, with the header that matches the scalar form", () => {
  for (const endpoint of ENDPOINTS) {
    const req = shapeRequest({ endpoint, blocks: ctx(), instruction: "go" });
    assert.equal(req.fallbacks, "default", endpoint);
    assert.ok(
      req.betas.includes("server-side-fallback-2026-07-01"),
      `${endpoint} must send the -07-01 header for fallbacks:"default"`,
    );
    assert.equal(
      req.betas.includes("server-side-fallback-2026-06-01"),
      false,
      `${endpoint} must not send the array-form header`,
    );
  }
});

test("Files beta is sent only when a block actually cites a file_id", () => {
  const withFiles = shapeRequest({
    endpoint: "review",
    blocks: ctx([attachment()]),
    instruction: "go",
  });
  assert.ok(withFiles.betas.includes("files-api-2025-04-14"));

  const withoutFiles = shapeRequest({
    endpoint: "review",
    blocks: ctx(),
    instruction: "go",
  });
  assert.equal(withoutFiles.betas.includes("files-api-2025-04-14"), false);
});

test("the system prompt is byte-identical across endpoints, or caching breaks", () => {
  const systems = ENDPOINTS.map(
    (endpoint) =>
      shapeRequest({ endpoint, blocks: ctx(), instruction: "go" }).system[0].text,
  );
  assert.equal(new Set(systems).size, 1, "one shared system prompt only");
  assert.equal(systems[0], SHARED_SYSTEM);
});

test("the endpoint instruction goes last, after the cached prefix", () => {
  const req = shapeRequest({
    endpoint: "review",
    blocks: ctx([attachment()]),
    instruction: "REVIEW_INSTRUCTION_MARKER",
  });
  const content = req.messages[0].content;
  const last = content[content.length - 1];
  assert.ok(last.type === "text" && last.text === "REVIEW_INSTRUCTION_MARKER");
  assert.equal(last.cache_control, undefined, "instruction must not be cached");

  const lastBreakpoint = content.reduce(
    (acc, block, i) => (block.cache_control ? i : acc),
    -1,
  );
  assert.ok(
    lastBreakpoint < content.length - 1,
    "every breakpoint must precede the instruction",
  );
});

test("no endpoint asks for more output than its model can produce", () => {
  for (const endpoint of ENDPOINTS) {
    assert.equal(
      maxTokensExceedsModel(endpoint),
      false,
      `${endpoint} requests ${ENDPOINT_MAX_TOKENS[endpoint]} but ${ENDPOINT_MODEL[endpoint]} caps at ${MODEL_CAPS[ENDPOINT_MODEL[endpoint]].maxOutputTokens}`,
    );
    const req = shapeRequest({ endpoint, blocks: ctx(), instruction: "go" });
    assert.ok(
      req.max_tokens <= MODEL_CAPS[req.model].maxOutputTokens,
      `${endpoint} max_tokens not clamped`,
    );
  }
});

test("a json schema lands in output_config.format alongside effort", () => {
  const schema = { type: "object", properties: {}, additionalProperties: false };
  const withEffort = shapeRequest({
    endpoint: "review",
    blocks: ctx(),
    instruction: "go",
    jsonSchema: schema,
  });
  assert.equal(withEffort.output_config?.format?.type, "json_schema");
  assert.equal(withEffort.output_config?.effort, "high");

  // On Haiku the schema must still apply even though effort is omitted.
  const noEffort = shapeRequest({
    endpoint: "grade",
    blocks: ctx(),
    instruction: "go",
    jsonSchema: schema,
  });
  assert.equal(noEffort.output_config?.format?.type, "json_schema");
  assert.equal(noEffort.output_config?.effort, undefined);
});
