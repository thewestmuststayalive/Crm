import { Badge } from "@/components/display";

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const style =
    score >= 75 ? "bg-emerald-50 text-emerald-800" : score >= 45 ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700";
  return <Badge className={style}>Hjemmeside {score}/100</Badge>;
}
