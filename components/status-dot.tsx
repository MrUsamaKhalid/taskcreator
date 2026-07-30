import type { Database } from "@/lib/database.types";

type Status = Database["public"]["Enums"]["prompt_status"];

const STYLES: Record<Status, { dot: string; label: string }> = {
  draft: { dot: "bg-faint", label: "Draft" },
  reviewed: { dot: "bg-accent", label: "Reviewed" },
  ready: { dot: "bg-navy", label: "Ready" },
  tested: { dot: "bg-good", label: "Tested" },
};

export function StatusDot({ status }: { status: Status }) {
  const style = STYLES[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
      <span className="text-xs text-muted">{style.label}</span>
    </span>
  );
}
