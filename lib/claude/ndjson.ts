import { MalformedOutputError, RefusalError } from "./call";

/**
 * One newline-delimited JSON event on the wire.
 *
 * NDJSON rather than SSE because there is no browser API that makes SSE worth it
 * here: `EventSource` cannot issue a POST, so a fetch + reader is needed either
 * way, and at that point NDJSON is one `JSON.parse` per line against SSE's
 * field-prefix grammar.
 */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; [key: string]: unknown }
  | { type: "error"; message: string; kind?: string };

/**
 * Run a streaming job and return it as an NDJSON response.
 *
 * Errors are reported *inside* the stream, not as a status code. Once the first
 * byte is out the status line is already sent, and by then a thrown error would
 * otherwise reach the browser as a silently truncated stream — so the terminal
 * event is always either `done` or `error`, and the client can rely on that.
 */
export function ndjsonStream(
  run: (emit: (event: StreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await run(emit);
      } catch (error) {
        emit({ type: "error", ...describe(error) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Tells any intermediate proxy not to buffer, which would defeat the point.
      "X-Accel-Buffering": "no",
    },
  });
}

function describe(error: unknown): { message: string; kind?: string } {
  if (error instanceof RefusalError) {
    return { message: error.message, kind: "refusal" };
  }
  if (error instanceof MalformedOutputError) {
    return { message: error.message, kind: "malformed" };
  }
  return {
    message: error instanceof Error ? error.message : "Something went wrong.",
  };
}
