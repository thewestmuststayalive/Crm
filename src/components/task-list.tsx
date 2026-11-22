import Link from "next/link";
import { deleteTask, postponeTask, toggleTask } from "@/app/actions/tasks";
import type { TaskItem } from "@/lib/crm";
import { formatIsoDate, todayIso } from "@/lib/labels";
import { cx } from "./styles";

/** Liste over opgaver med afkrydsning. `showLinks` viser hvad opgaven er knyttet til. */
export function TaskList({ tasks, showLinks = true }: { tasks: TaskItem[]; showLinks?: boolean }) {
  const today = todayIso();
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => {
        const overdue = !t.completedAt && t.dueDate !== null && t.dueDate < today;
        const dueToday = !t.completedAt && t.dueDate === today;
        return (
          <li key={t.id} className="flex items-start gap-3 py-2.5">
            <form action={toggleTask} className="pt-0.5">
              <input type="hidden" name="id" value={t.id} />
              <button
                type="submit"
                aria-label={t.completedAt ? `Genåbn: ${t.title}` : `Markér som udført: ${t.title}`}
                className={cx(
                  "flex h-5 w-5 items-center justify-center rounded border text-xs",
                  t.completedAt
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-400 bg-white hover:border-slate-700",
                )}
              >
                {t.completedAt ? "✓" : ""}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <p className={cx("text-sm", t.completedAt ? "text-slate-400 line-through" : "text-slate-900")}>
                {t.title}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                {t.dueDate && (
                  <span className={cx(overdue && "font-medium text-red-700", dueToday && "font-medium text-amber-700")}>
                    {overdue ? "Forfalden: " : dueToday ? "I dag: " : "Frist: "}
                    {formatIsoDate(t.dueDate)}
                  </span>
                )}
                {t.assigneeName && <span>{t.assigneeName}</span>}
                {showLinks && t.contactId && (
                  <Link href={`/kunder/${t.contactId}`} className="underline">
                    {t.contactName}
                  </Link>
                )}
                {showLinks && t.companyId && (
                  <Link href={`/virksomheder/${t.companyId}`} className="underline">
                    {t.companyName}
                  </Link>
                )}
                {showLinks && t.dealId && (
                  <Link href={`/pipeline/${t.dealId}`} className="underline">
                    Deal: {t.dealTitle}
                  </Link>
                )}
              </p>
            </div>
            {!t.completedAt && (
              <span className="flex gap-1">
                {[
                  { days: 1, label: "+1 dag", aria: "en dag" },
                  { days: 7, label: "+1 uge", aria: "en uge" },
                ].map((p) => (
                  <form key={p.days} action={postponeTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="days" value={p.days} />
                    <button
                      type="submit"
                      className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label={`Udsæt ${t.title} ${p.aria}`}
                    >
                      {p.label}
                    </button>
                  </form>
                ))}
              </span>
            )}
            <form action={deleteTask}>
              <input type="hidden" name="id" value={t.id} />
              <button
                type="submit"
                className="text-xs text-slate-400 hover:text-red-700"
                aria-label={`Slet opgave: ${t.title}`}
              >
                Slet
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
