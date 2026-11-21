import Link from "next/link";
import { deleteActivity } from "@/app/actions/activities";
import type { Role } from "@/db/schema";
import type { TimelineItem } from "@/lib/crm";
import { ACTIVITY_LABELS, formatDateTime } from "@/lib/labels";
import { hasRole } from "@/lib/roles";
import { Badge, EmptyState } from "./display";
import { ConfirmButton } from "./ui";

export function Timeline({
  items,
  userId,
  role,
  back,
  showContact = false,
}: {
  items: TimelineItem[];
  userId: string;
  role: Role;
  back: string;
  showContact?: boolean;
}) {
  if (items.length === 0) return <EmptyState>Ingen aktiviteter endnu.</EmptyState>;

  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const canDelete = hasRole(role, "ADMIN") || (item.authorId === userId && item.type !== "SYSTEM");
        const showDeal = item.dealId && back !== `/pipeline/${item.dealId}`;
        return (
          <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{ACTIVITY_LABELS[item.type]}</Badge>
                <span>{item.authorName ?? "Slettet bruger"}</span>
                <span>·</span>
                <time dateTime={item.createdAt.toISOString()}>{formatDateTime(item.createdAt)}</time>
                {showContact && item.contactId && (
                  <>
                    <span>·</span>
                    <Link href={`/kunder/${item.contactId}`} className="underline">
                      {item.contactName}
                    </Link>
                  </>
                )}
                {showDeal && (
                  <>
                    <span>·</span>
                    <Link href={`/pipeline/${item.dealId}`} className="underline">
                      Deal: {item.dealTitle}
                    </Link>
                  </>
                )}
              </div>
              {canDelete && (
                <form action={deleteActivity}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="back" value={back} />
                  <ConfirmButton message="Slet denne aktivitet?" className="px-2 py-1 text-xs">
                    Slet
                  </ConfirmButton>
                </form>
              )}
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap text-slate-800">{item.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
