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

export function ReplyForm({ id, disabledReason }: { id: string; disabledReason: string | null }) {
  const [state, action] = useActionState(replyToConversation.bind(null, id), {});
  if (disabledReason) {
    return <p className="border-t border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{disabledReason}</p>;
  }
  return (
    <form action={action} className="space-y-2 border-t border-slate-200 p-3">
      <label htmlFor="reply" className="sr-only">
        Svar
      </label>
      <Textarea
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
