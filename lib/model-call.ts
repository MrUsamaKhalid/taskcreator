"use client";

import type { TokenUsage } from "@/lib/pricing";

/**
 * Client-side helpers for talking to the five model-backed routes.
 *
 * Kept separate from the components so the parsing rules — particularly the
 * NDJSON framing — live in one place rather than being re-derived in each pane.
 */

export type CallCost = {
  costUsd: number;
  usage: TokenUsage;
  model: string;
};

export class ModelCallError extends Error {
  constructor(
    message: string,
    readonly kind?: string,
  ) {
    super(message);
    this.name = "ModelCallError";
  }
}

/**
 * Turn a non-2xx into something a person can act on.
 *
 * A gateway timeout is not produced by this app: the platform kills the
 * function and returns its own HTML error page, so there is no JSON body to
 * read a message out of and the status code is all we have. Left generic it
 * surfaced as "Request failed (504)", which reads like a bug rather than the
 * one thing it actually is — the step took longer than the deployment allows.
 *
 * Measured: a review of a full brief runs about 64s against a 60s ceiling, so
 * this fires on realistic input rather than pathological input.
 */
/**
 * Fired when a step dies without reporting usage.
 *
 * A cross-cutting signal rather than a prop threaded through all five steps:
 * every one of them already funnels through postJson/streamNdjson, and a new
 * step added later is covered without remembering to wire anything up.
 */
type UncountedListener = () => void;
const uncountedListeners = new Set<UncountedListener>();

export function onUncountedCall(listener: UncountedListener): () => void {
  uncountedListeners.add(listener);
  return () => {
    uncountedListeners.delete(listener);
  };
}

/**
 * Only for a timeout. A 4xx is rejected before any model call is made, so
 * nothing was billed and flagging it would overstate spend rather than correct
 * it.
 */
function noteUncounted(status: number): void {
  if (status !== 504 && status !== 502) return;
  for (const listener of uncountedListeners) listener();
}

function describeFailure(status: number, serverMessage?: string): string {
  noteUncounted(status);
  if (serverMessage) return serverMessage;
  if (status === 504 || status === 502) {
    return "This step ran longer than the server allows and was cut off. Opus 5 at high effort on a full brief takes around a minute, and the deployment's limit is 60 seconds. Shortening the brief can bring it under; raising the limit needs a Vercel plan that allows a longer maxDuration.";
  }
  if (status === 413) {
    return "The brief and its attachments were too large to send in one request.";
  }
  return `Request failed (${status})`;
}

/** POST JSON, and turn a non-2xx into an error carrying the server's message. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string; kind?: string } & T)
    | null;

  if (!response.ok) {
    throw new ModelCallError(
      describeFailure(response.status, payload?.error),
      payload?.kind,
    );
  }
  if (!payload) throw new ModelCallError("The server returned nothing.");
  return payload;
}

type DoneEvent = Record<string, unknown> & { type: "done" };

/**
 * POST and read an NDJSON stream, calling `onText` per delta.
 *
 * Two framing details that are easy to get wrong:
 *
 * 1. A chunk boundary can land mid-line, so the tail is carried over rather than
 *    parsed. Parsing per-chunk instead produces intermittent JSON errors that
 *    only show up on slow connections.
 * 2. The stream ending without a terminal event is itself a failure — that is
 *    what a serverless timeout looks like from here, and silently treating it as
 *    success would show a half-written prompt as finished.
 */
export async function postStream(
  url: string,
  body: unknown,
  onText: (delta: string) => void,
): Promise<DoneEvent> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      kind?: string;
    } | null;
    throw new ModelCallError(
      describeFailure(response.status, payload?.error),
      payload?.kind,
    );
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let done: DoneEvent | null = null;
  let failure: ModelCallError | null = null;

  const handle = (line: string) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    let event: { type?: string; text?: string; message?: string; kind?: string };
    try {
      event = JSON.parse(trimmed);
    } catch {
      return; // A malformed line is not worth aborting a live stream over.
    }

    if (event.type === "delta" && typeof event.text === "string") {
      onText(event.text);
    } else if (event.type === "error") {
      failure = new ModelCallError(
        event.message ?? "Something went wrong.",
        event.kind,
      );
    } else if (event.type === "done") {
      done = event as DoneEvent;
    }
  };

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += value;

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handle(buffer);

  if (failure) throw failure;
  if (!done) {
    throw new ModelCallError(
      "The connection closed before the response finished. On Vercel's Hobby plan a request is cut off at 60 seconds.",
    );
  }
  return done;
}

/** Pull the cost fields out of a done event or a JSON response. */
export function costOfResult(payload: Record<string, unknown>): CallCost | null {
  const costUsd = payload.costUsd;
  if (typeof costUsd !== "number") return null;
  return {
    costUsd,
    usage: (payload.usage as TokenUsage) ?? {},
    model: typeof payload.model === "string" ? payload.model : "",
  };
}
