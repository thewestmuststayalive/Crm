import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createContactFromConversation, linkConversationToContact } from "@/app/actions/inbox";
import { Badge } from "@/components/display";
import { cx } from "@/components/styles";
import { Button, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { getSavedReplies } from "@/lib/saved-replies";
import { getContactOptions } from "@/lib/crm";
import { formatDateTime } from "@/lib/labels";
import { isReplyWindowOpen } from "@/lib/meta/inbox";
import { isUuid } from "@/lib/validation";
import { MarkRead, ReplyForm, ScrollToBottom } from "./client";

export const metadata: Metadata = { title: "Samtale" };

type Attachment = { type?: string; payload?: { url?: string } };

export default async function ConversationPage({ params }: PageProps<"/indbakke/[id]">) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  if (!isUuid(id)) notFound();

  const [conversation] = await db
    .select({
      c: schema.conversations,
      pageName: schema.metaPages.name,
      contactName: schema.contacts.name,
    })
    .from(schema.conversations)
    .innerJoin(schema.metaPages, eq(schema.metaPages.id, schema.conversations.metaPageId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .where(and(eq(schema.conversations.workspaceId, workspace.id), eq(schema.conversations.id, id)))
    .limit(1);
  if (!conversation) notFound();
  const c = conversation.c;

  const [messages, contacts, replies] = await Promise.all([
    db
      .select({
        id: schema.messages.id,
        direction: schema.messages.direction,
        text: schema.messages.text,
        attachments: schema.messages.attachments,
        sentAt: schema.messages.sentAt,
        sentByName: schema.users.name,
      })
      .from(schema.messages)
      .leftJoin(schema.users, eq(schema.users.id, schema.messages.sentById))
      .where(eq(schema.messages.conversationId, c.id))
      .orderBy(asc(schema.messages.sentAt))
      .limit(500),
    c.contactId ? Promise.resolve([]) : getContactOptions(workspace.id),
    getSavedReplies(workspace.id),
  ]);

  const disabledReason = isReplyWindowOpen(c.lastInboundAt)
    ? null
    : "Der er gået mere end 24 timer siden kundens seneste besked. Meta tillader kun svar inden for 24 timer – svar i stedet fra Meta Business Suite, eller vent til kunden skriver igen.";
  const platformLabel = c.platform === "INSTAGRAM" ? "Instagram" : "Messenger";

  return (
    <div className="flex h-full min-h-[70vh] flex-col md:min-h-0">
      <MarkRead id={c.id} unread={c.unreadCount} />
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
        <div className="min-w-0">
          <Link href="/indbakke" className="text-xs text-slate-500 md:hidden">
            ← Alle samtaler
          </Link>
          <h2 className="truncate font-semibold text-slate-900">{c.name ?? "Ukendt"}</h2>
          <p className="text-xs text-slate-500">
            <Badge className={c.platform === "INSTAGRAM" ? "bg-pink-50 text-pink-800" : "bg-sky-50 text-sky-800"}>
              {platformLabel}
            </Badge>{" "}
            {conversation.pageName}
          </p>
        </div>
        {c.contactId ? (
          <Link href={`/kunder/${c.contactId}`} className="text-sm underline">
            Kontakt: {conversation.contactName}
          </Link>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <form action={createContactFromConversation}>
              <input type="hidden" name="id" value={c.id} />
              <Button type="submit" className="px-2.5 py-1 text-xs">
                Opret som lead
              </Button>
            </form>
            {contacts.length > 0 && (
              <form action={linkConversationToContact} className="flex items-center gap-1">
                <input type="hidden" name="id" value={c.id} />
                <label htmlFor="link-contact" className="sr-only">
                  Knyt til eksisterende kontakt
                </label>
                <Select id="link-contact" name="contactId" defaultValue="" className="max-w-40 py-1 text-xs">
                  <option value="" disabled>
                    Knyt til kontakt …
                  </option>
                  {contacts.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                    </option>
                  ))}
                </Select>
                <Button variant="secondary" type="submit" className="px-2.5 py-1 text-xs">
                  Knyt
                </Button>
              </form>
            )}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
        <ol className="space-y-2" aria-label="Beskeder">
          {messages.map((m) => {
            const out = m.direction === "OUT";
            const attachments = (m.attachments as Attachment[] | null) ?? [];
            return (
              <li key={m.id} className={cx("flex", out ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    out ? "bg-brand-700 text-white" : "bg-white text-slate-900",
                  )}
                >
                  {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                  {attachments.map((a, i) =>
                    a.payload?.url && /^https:\/\//.test(a.payload.url) ? (
                      <a
                        key={i}
                        href={a.payload.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block underline"
                      >
                        Åbn vedhæftning ({a.type ?? "fil"})
                      </a>
                    ) : (
                      <span key={i} className="block italic">
                        [{a.type ?? "vedhæftning"}]
                      </span>
                    ),
                  )}
                  <p className={cx("mt-1 text-[10px]", out ? "text-slate-300" : "text-slate-400")}>
                    {formatDateTime(m.sentAt)}
                    {out && m.sentByName && ` · ${m.sentByName}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <ScrollToBottom count={messages.length} />
      </div>

      <ReplyForm
        id={c.id}
        disabledReason={disabledReason}
        replies={replies.map((r) => ({ id: r.id, title: r.title, body: r.body }))}
        vars={{ navn: (conversation.contactName ?? c.name ?? "").split(" ")[0] ?? "", firma: workspace.name }}
      />
    </div>
  );
}
