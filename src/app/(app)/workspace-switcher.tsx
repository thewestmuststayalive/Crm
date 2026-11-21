"use client";

import { useRef } from "react";
import { switchWorkspace } from "@/app/actions/workspace";
import { Select } from "@/components/ui";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: string;
  workspaces: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={switchWorkspace}>
      <label htmlFor="workspace" className="sr-only">
        Vælg firma
      </label>
      <Select
        id="workspace"
        name="workspaceId"
        defaultValue={current}
        key={current}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full border-white/15 bg-white/10 text-white focus:border-brand-300 [&>option]:text-slate-900"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
    </form>
  );
}
