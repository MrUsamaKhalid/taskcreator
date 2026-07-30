"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";

/**
 * One numbered, collapsible step in the left-hand task pane — the structure the
 * reference tool uses. Nothing here gates progress; steps stay open by default
 * so the whole brief is visible while you work.
 */
export function Step({
  number,
  title,
  description,
  defaultOpen = true,
  aside,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="border-b border-line-soft last:border-b-0"
    >
      <div className="flex items-center gap-2 px-5 py-3">
        <Collapsible.Trigger className="group flex min-w-0 flex-1 items-center gap-2 text-left">
          <span
            className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▸
          </span>
          <span className="text-sm font-semibold text-navy">
            <span className="mr-1.5 text-faint">{number}</span>
            {title}
          </span>
        </Collapsible.Trigger>
        {aside}
      </div>

      <Collapsible.Content>
        <div className="px-5 pb-5 pl-11">
          {description ? (
            <p className="mb-3 text-sm text-muted">{description}</p>
          ) : null}
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
