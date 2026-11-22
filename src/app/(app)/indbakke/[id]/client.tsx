"use client";

import { useActionState, useEffect, useRef } from "react";
import { markConversationRead, replyToConversation } from "@/app/actions/inbox";
import { FormMessage, SubmitButton, Textarea } from "@/components/ui";

export function MarkRead({ id, unread }: { id: string; unread: number }) {
  useEffect(() => {
    if (unread > 0) void markConversationRead(id);
  }, [id, unread]);
  return null;
}

/** Ruller beskedlisten til bunden, når samtalen åbnes eller får nye beskeder. */
export function ScrollToBottom({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [count]);
  return <div ref={ref} />;
}

type SavedReply = { id: string; title: string; body: string };

export function ReplyForm({
  id,
  disabledReason,
  replies = [],
  vars = {},
}: {
  id: string;
  disabledReason: string | null;
  replies?: SavedReply[];
  vars?: Record<string, string>;
}) {
  const [state, action] = useActionState(replyToConversation.bind(null, id), {});
  const textRef = useRef<HTMLTextAreaElement>(null);
  const insert = (reply: SavedReply) => {
    const el = textRef.current;
    if (!el) return;
    const text = reply.body.replace(/\{([a-zæøå]+)\}/gi, (whole, key: string) => vars[key.toLowerCase()] || whole);
    el.value = el.value.trim() ? `${el.value.trimEnd()}\n\n${text}` : text;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };
  if (disabledReason) {
    return <p className="border-t border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{disabledReason}</p>;
  }
  return (
    <form action={action} className="space-y-2 border-t border-slate-200 p-3">
      <label htmlFor="reply" className="sr-only">
        Svar
      </label>
      {replies.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Svarskabeloner">
          {replies.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => insert(r)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-brand-300 hover:bg-brand-50"
            >
              {r.title}
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={textRef}
        id="reply"
        name="text"
        rows={2}
        placeholder="Skriv et svar …"
        defaultValue={state.values?.text}
        required
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">Ctrl/⌘ + Enter for at sende</span>
        <SubmitButton pendingText="Sender…">Send</SubmitButton>
      </div>
      {state.error && <FormMessage state={state} />}
    </form>
  );
}
