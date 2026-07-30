import type { Database } from "@/lib/database.types";

type ExtractionStatus = Database["public"]["Enums"]["extraction_status"];

export type ExtractResult = {
  status: ExtractionStatus;
  text: string | null;
  /** How this file should be handed to Claude. */
  delivery: "document" | "image" | "text" | "name_only";
};

/** Files Claude reads natively as a PDF document block. */
const PDF_MIME = "application/pdf";

/** Vision-capable image types. SVG is deliberately absent — Claude's vision
 *  does not accept it, but it *is* text, so we extract it as text instead. */
const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

/** Types we can read as UTF-8 straight off the wire. */
const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "image/svg+xml",
  "text/html",
  "text/xml",
  "application/xml",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "svg",
  "html",
  "xml",
  "yml",
  "yaml",
  "sql",
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
]);

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Only the modern OOXML spreadsheet format. Legacy .xls (BIFF) is not
 *  supported by exceljs, so those fall through to name-only. */
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Cap on extracted text per file. Large spreadsheets can run to millions of
 * characters; past a point the extra rows stop adding signal and start crowding
 * out the rest of the brief. Truncation is marked inline so the model knows the
 * text is partial rather than silently assuming it saw everything.
 */
const MAX_EXTRACTED_CHARS = 200_000;

/**
 * Flatten one spreadsheet cell to a plain string.
 *
 * exceljs hands back rich objects, not primitives: formulas arrive as
 * `{ formula, result }`, hyperlinks as `{ text, hyperlink }`, styled text as
 * `{ richText: [...] }`. Naive String() on any of those yields "[object Object]",
 * which would quietly feed the model garbage instead of its data.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const cell = value as Record<string, unknown>;
    if (Array.isArray(cell.richText)) {
      return cell.richText
        .map((part) => String((part as { text?: unknown }).text ?? ""))
        .join("");
    }
    // A formula cell: prefer the computed value over the expression.
    if ("result" in cell) return cellToString(cell.result);
    if ("text" in cell) return String(cell.text ?? "");
    if ("error" in cell) return String(cell.error ?? "");
    return "";
  }
  return String(value);
}

/** Quote a CSV field only when it needs it. */
function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Convert every sheet of a workbook to labelled CSV.
 *
 * Sheet names are kept as headers because they carry meaning the rows don't —
 * a brief that says "use the Units tab, ignore Old" is only actionable if the
 * model can tell the tabs apart.
 */
async function xlsxToCsv(bytes: ArrayBuffer): Promise<string> {
  const mod = await import("exceljs");
  // exceljs is CommonJS; under Node ESM the class hangs off the default export.
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);

  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-indexed with a hole at 0.
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      lines.push(values.map((v) => csvEscape(cellToString(v))).join(","));
    });
    sheets.push(`--- sheet: ${sheet.name} ---\n${lines.join("\n")}`);
  });

  return sheets.join("\n\n");
}

function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return (
    text.slice(0, MAX_EXTRACTED_CHARS) +
    `\n\n[…truncated: ${text.length - MAX_EXTRACTED_CHARS} more characters not shown]`
  );
}

/**
 * Decide how a file reaches Claude, and pull text out of it when that's the only
 * way in.
 *
 * PDFs and images need no extraction — Claude reads them natively as document
 * and image blocks, which preserves layout and visual detail that a text dump
 * would throw away.
 */
export async function extractFile(
  filename: string,
  mime: string,
  bytes: ArrayBuffer,
): Promise<ExtractResult> {
  const ext = extensionOf(filename);

  if (mime === PDF_MIME || ext === "pdf") {
    return { status: "not_needed", text: null, delivery: "document" };
  }

  if (IMAGE_MIMES.has(mime)) {
    return { status: "not_needed", text: null, delivery: "image" };
  }

  if (TEXT_MIMES.has(mime) || TEXT_EXTENSIONS.has(ext)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      return { status: "ok", text: truncate(text), delivery: "text" };
    } catch {
      return { status: "failed", text: null, delivery: "name_only" };
    }
  }

  if (mime === DOCX_MIME || ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      return { status: "ok", text: truncate(value), delivery: "text" };
    } catch {
      return { status: "failed", text: null, delivery: "name_only" };
    }
  }

  if (mime === XLSX_MIME || ext === "xlsx") {
    try {
      return {
        status: "ok",
        text: truncate(await xlsxToCsv(bytes)),
        delivery: "text",
      };
    } catch {
      return { status: "failed", text: null, delivery: "name_only" };
    }
  }

  // Everything else still gets stored and still gets named in the prompt — we
  // just can't show Claude the contents.
  return { status: "unsupported", text: null, delivery: "name_only" };
}

/** Whether this file should be pushed to the Anthropic Files API. */
export function needsAnthropicUpload(delivery: ExtractResult["delivery"]): boolean {
  return delivery === "document" || delivery === "image";
}
