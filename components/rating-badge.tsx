import type { Database } from "@/lib/database.types";

type Rating = Database["public"]["Enums"]["rating"];

const STYLES: Record<Rating, { className: string; label: string }> = {
  excellent: { className: "text-good", label: "Excellent" },
  good: { className: "text-good", label: "Good" },
  needs_work: { className: "text-warn", label: "Needs work" },
  missing: { className: "text-bad", label: "Missing" },
};

/** Right-aligned word rating, as in the reference review pane. */
export function RatingBadge({ rating }: { rating: Rating | null | undefined }) {
  if (!rating) return null;
  const style = STYLES[rating];
  return (
    <span className={`text-sm font-medium ${style.className}`}>{style.label}</span>
  );
}
