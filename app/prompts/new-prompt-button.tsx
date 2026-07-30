"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { createPrompt } from "./actions";

export function NewPromptButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await createPrompt();
          } catch (error) {
            // redirect() throws by design; only surface real failures.
            if (error instanceof Error && !error.message.includes("NEXT_REDIRECT")) {
              toast.error(error.message);
            }
          }
        })
      }
      className="rounded-md bg-navy px-3 py-2 text-sm font-medium text-white transition hover:bg-navy-soft disabled:opacity-50"
    >
      {pending ? "Creating…" : "New prompt"}
    </button>
  );
}
