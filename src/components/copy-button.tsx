"use client";

import { useState } from "react";
import { Button } from "./ui";

export function CopyButton({ text, label = "Kopiér" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="px-2.5 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Udklipsholderen kan være blokeret; brugeren kan stadig markere teksten selv.
        }
      }}
    >
      {copied ? "Kopieret" : label}
    </Button>
  );
}
