import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Platform } from "@/db/schema";
import { respondToContact, respondToConversation } from "@/lib/awaiting";
import { notify } from "@/lib/notify";
import { graph, GraphError } from "./graph";
import { findPageByExternalId, pageToken, type MetaPage } from "./store";

/** Meta tillader kun frie svar inden for 24 timer efter kundens seneste besked. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isReplyWindowOpen(lastInboundAt: Date | null) {
  return lastInboundAt !== null && Date.now() - lastInboundAt.getTime() < REPLY_WINDOW_MS;
}

type Attachment = { type?: string; payload?: { url?: string } };
type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Attachment[]; is_deleted?: boolean };
  postback?: { mid?: string; title?: string; payload?: string };
};

const ATTACHMENT_LABELS: Record<string, string> = {
  image: "[Billede]",
  video: "[Video]",
  audio: "[Lydbesked]",
  file: "[Fil]",
  sticker: "[Sticker]",
};

function preview(text: string | null, attachments: Attachment[] | undefined) {
  if (text) return text.slice(0, 140);
  const type = attachments?.[0]?.type ?? "";
  return ATTACHMENT_LABELS[type] ?? "[Vedhæftning]";
}

/** Henter navnet på den person, der skriver (bedste forsøg; fejler stille). */
async function fetchProfileName(page: MetaPage, platform: Platform, userId: string): Promise<string | null> {
  try {
    if (platform === "MESSENGER") {
      const p = await graph.get<{ first_name?: string; last_name?: string; name?: string }>(userId, pageToken(page), {
        fields: "first_name,last_name",
      });
      return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || null;
    }
    const p = await graph.get<{ name?: string; username?: string }>(userId, pageToken(page), { fields: "name,username" });
    return p.name || (p.username ? `@${p.username}` : null);
  } catch {
    return null;
  }
}

async function upsertConversation(
  page: MetaPage,
  platform: Platform,
  externalUserId: string,
  name?: string | null,
): Promise<{ conversation: typeof schema.conversations.$inferSelect; created: boolean }> {
  const [existing] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.metaPageId, page.id),
        eq(schema.conversations.platform, platform),
        eq(schema.conversations.externalUserId, externalUserId),
      ),
    )
    .limit(1);
  if (existing) return { conversation: existing, created: false };

  const resolvedName = name ?? (await fetchProfileName(page, platform, externalUserId));
  const [created] = await db
    .insert(schema.conversations)
    .values({ workspaceId: page.workspaceId, metaPageId: page.id, platform, externalUserId, name: resolvedName })
    .onConflictDoNothing()
    .returning();
  if (created) return { conversation: created, created: true };
  // En samtidig webhook nåede at oprette den.
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.metaPageId, page.id),
        eq(schema.conversations.platform, platform),
        eq(schema.conversations.externalUserId, externalUserId),
      ),
    )
    .limit(1);
  return { conversation: row, created: false };
}

/** Gemmer en besked (ind eller ud) og opdaterer samtalens oversigt. Dubletter ignoreres. */
export async function storeMessage(input: {
  page: MetaPage;
  platform: Platform;
  externalUserId: string;
  userName?: string | null;
  direction: "IN" | "OUT";
  externalId: string | null;
  text: string | null;
  attachments?: Attachment[];
  sentAt: Date;
  sentById?: string | null;
  countAsUnread?: boolean;
}) {
  const { conversation, created } = await upsertConversation(
    input.page,
    input.platform,
    input.externalUserId,
    input.userName,
  );
  const live = input.countAsUnread !== false; // false ved import af gamle samtaler
  const [inserted] = await db
    .insert(schema.messages)
    .values({
      workspaceId: input.page.workspaceId,
      conversationId: conversation.id,
      direction: input.direction,
      text: input.text,
      attachments: input.attachments?.length ? input.attachments : null,
      externalId: input.externalId,
      sentById: input.sentById ?? null,
      sentAt: input.sentAt,
    })
    .onConflictDoNothing({ target: schema.messages.externalId })
    .returning({ id: schema.messages.id });
  if (!inserted) return conversation;

  const isIn = input.direction === "IN";
  await db
    .update(schema.conversations)
    .set({
      lastMessageAt: sql`greatest(${schema.conversations.lastMessageAt}, ${input.sentAt})`,
      lastMessagePreview: sql`case when ${schema.conversations.lastMessageAt} is null or ${schema.conversations.lastMessageAt} <= ${input.sentAt} then ${preview(input.text, input.attachments)} else ${schema.conversations.lastMessagePreview} end`,
      ...(isIn
        ? {
            lastInboundAt: sql`greatest(${schema.conversations.lastInboundAt}, ${input.sentAt})`,
            ...(live
              ? {
                  unreadCount: sql`${schema.conversations.unreadCount} + 1`,
                  awaitingSince: sql`coalesce(${schema.conversations.awaitingSince}, ${input.sentAt})`,
                }
              : {}),
          }
        : {}),
    })
    .where(eq(schema.conversations.id, conversation.id));

  const platformLabel = input.platform === "INSTAGRAM" ? "Instagram" : "Messenger";
  if (isIn && live && created) {
    await notify({
      workspaceId: input.page.workspaceId,
      to: "all",
      type: "NEW_CONVERSATION",
      title: `Ny besked fra ${conversation.name ?? "en kunde"} på ${platformLabel}`,
      body: preview(input.text, input.attachments),
      href: `/indbakke/${conversation.id}`,
    });
  }
  if (!isIn) {
    // Et svar (fra Kundespor eller fx Meta Business Suite) afslutter ventetiden.
    await respondToConversation(input.page.workspaceId, conversation.id, input.platform, {
      log: true,
      at: input.sentAt,
      userId: input.sentById,
    });
    if (conversation.contactId) {
      await respondToContact(input.page.workspaceId, conversation.contactId, { log: true, userId: input.sentById });
    }
  }
  return conversation;
}

/** Behandler en "messaging"-hændelse fra webhooken (Messenger eller Instagram). */
export async function handleMessagingEvent(platform: Platform, accountId: string, event: MessagingEvent) {
  const page = await findPageByExternalId(platform === "MESSENGER" ? "page" : "instagram", accountId);
  if (!page) return;

  const msg = event.message;
  const postback = event.postback;
  if (!msg && !postback) return; // Læst-/leveret-kvitteringer m.m. ignoreres.
  if (msg?.is_deleted) return;

  const isEcho = Boolean(msg?.is_echo);
  const externalUserId = isEcho ? event.recipient?.id : event.sender?.id;
  if (!externalUserId) return;

  await storeMessage({
    page,
    platform,
    externalUserId,
    direction: isEcho ? "OUT" : "IN",
    externalId: msg?.mid ?? postback?.mid ?? null,
    text: msg?.text ?? postback?.title ?? null,
    attachments: msg?.attachments,
    sentAt: event.timestamp ? new Date(event.timestamp) : new Date(),
  });
}

export class ReplyError extends Error {}

/** Sender et svar til kunden via Meta og gemmer det i samtalen. */
export async function sendReply(page: MetaPage, conversation: typeof schema.conversations.$inferSelect, text: string, userId: string) {
  if (!isReplyWindowOpen(conversation.lastInboundAt)) {
    throw new ReplyError("Der er gået mere end 24 timer siden kundens seneste besked, så Meta tillader ikke et svar herfra.");
  }
  let res: { message_id?: string };
  try {
    res = await graph.post<{ recipient_id?: string; message_id?: string }>(`${page.pageId}/messages`, pageToken(page), {
      recipient: { id: conversation.externalUserId },
      messaging_type: "RESPONSE",
      message: { text },
    });
  } catch (error) {
    if (error instanceof GraphError) throw new ReplyError(`Meta afviste beskeden: ${error.message}`);
    throw error;
  }
  await storeMessage({
    page,
    platform: conversation.platform,
    externalUserId: conversation.externalUserId,
    direction: "OUT",
    externalId: res.message_id ?? null,
    text,
    sentAt: new Date(),
    sentById: userId,
  });
}

type GraphConversation = {
  id: string;
  updated_time?: string;
  participants?: { data: { id: string; name?: string; username?: string }[] };
  messages?: { data: { id: string; message?: string; created_time: string; from?: { id: string } }[] };
};

/** Henter de seneste samtaler fra Meta (bruges når en side kobles på). */
export async function importConversations(page: MetaPage, platform: Platform, limit = 25) {
  const ownId = platform === "MESSENGER" ? page.pageId : page.igAccountId;
  if (!ownId) return 0;
  const res = await graph.get<{ data: GraphConversation[] }>(`${page.pageId}/conversations`, pageToken(page), {
    platform: platform === "MESSENGER" ? "messenger" : "instagram",
    fields: "participants,updated_time,messages.limit(25){id,message,created_time,from}",
    limit: String(limit),
  });

  let count = 0;
  for (const conv of res.data) {
    const other = conv.participants?.data.find((p) => p.id !== ownId && p.id !== page.pageId);
    if (!other) continue;
    for (const m of [...(conv.messages?.data ?? [])].reverse()) {
      const direction = m.from?.id === other.id ? "IN" : "OUT";
      await storeMessage({
        page,
        platform,
        externalUserId: other.id,
        userName: other.name ?? (other.username ? `@${other.username}` : null),
        direction,
        externalId: m.id,
        text: m.message ?? null,
        sentAt: new Date(m.created_time),
        countAsUnread: false,
      });
    }
    count++;
  }
  return count;
}
