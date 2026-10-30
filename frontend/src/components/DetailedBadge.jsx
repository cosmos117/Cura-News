import { Sparkles } from "lucide-react";

/**
 * Marks an article whose detailed summary is ready. Summaries are made the
 * first time any reader opens the Detailed tab and are shared with everyone,
 * so this appears on every list once one reader has generated it.
 */
export default function DetailedBadge({ status }) {
  if (status !== "DONE") return null;
  return (
    <span className="badge badge--purple badge--sm detailed-badge" title="Detailed summary ready">
      <Sparkles className="icon icon--sm" aria-hidden="true" />
      Detailed
    </span>
  );
}
