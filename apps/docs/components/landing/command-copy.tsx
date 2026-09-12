"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CommandCopy({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copy ${command}`}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-white/45 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      onClick={() => {
        void navigator.clipboard?.writeText(command);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-emerald-400" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      <span className="sr-only">{copied ? "Copied" : "Copy command"}</span>
    </button>
  );
}
