import { desc, eq } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { ConversationList } from "./conversation-list";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const { workspace } = await requireWorkspace();
  const conversations = await db
    .select({
      id: schema.conversations.id,
      name: schema.conversations.name,
      platform: schema.conversations.platform,
      lastMessageAt: schema.conversations.lastMessageAt,
      lastMessagePreview: schema.conversations.lastMessagePreview,
      unreadCount: schema.conversations.unreadCount,
      pageName: schema.metaPages.name,
    })
    .from(schema.conversations)
    .innerJoin(schema.metaPages, eq(schema.metaPages.id, schema.conversations.metaPageId))
    .where(eq(schema.conversations.workspaceId, workspace.id))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(200);

  return (
    <div className="mx-auto max-w-6xl">
      <AutoRefresh />
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Indbakke</h1>
      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white md:h-[calc(100vh-10rem)] md:grid-cols-[320px_1fr]">
        <ConversationList conversations={conversations.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt?.toISOString() ?? null }))} />
        <div className="min-h-0 min-w-0">{children}</div>
      </div>
    </div>
  );
}
