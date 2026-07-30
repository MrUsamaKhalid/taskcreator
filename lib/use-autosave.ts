"use client";

import { useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave for serializable state.
 *
 * Three details worth keeping:
 *
 * 1. The effect is keyed on `JSON.stringify(value)`, not `value`. Callers
 *    routinely pass an object literal — `useAutosave({ title, sector }, …)` —
 *    which is a new identity on every render; keying on identity would refire
 *    the effect forever and never stop saving. Everything this hook persists is
 *    JSON by definition (it ends up in a text or jsonb column), so comparing
 *    serialized form is both correct and identity-stable.
 * 2. `save` is mirrored into a ref *inside an effect* so an inline closure does
 *    not become a dependency and cancel the pending timer on every keystroke.
 *    Declared first so it commits before the debounce effect reads the ref.
 * 3. The first run never saves — otherwise merely opening a record would write
 *    it straight back unchanged.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delay = 800,
): SaveState {
  const [state, setState] = useState<SaveState>("idle");
  const saveRef = useRef(save);
  const isFirstRun = useRef(true);

  useEffect(() => {
    saveRef.current = save;
  });

  const serialized = JSON.stringify(value);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    let cancelled = false;
    setState("saving");

    const timer = setTimeout(() => {
      saveRef
        .current(JSON.parse(serialized) as T)
        .then(() => {
          if (!cancelled) setState("saved");
        })
        .catch(() => {
          if (!cancelled) setState("error");
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [serialized, delay]);

  return state;
}

export function SaveIndicatorText(state: SaveState): string {
  switch (state) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Save failed";
    default:
      return "";
  }
}
