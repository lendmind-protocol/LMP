"use client";

import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState } from "react";

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replaceAll(":", "");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        fontFamily: "inherit",
        theme: resolvedTheme === "dark" ? "dark" : "default",
      });
      try {
        const rendered = await mermaid.render(`lmp-diagram-${id}`, chart);
        if (!cancelled) setSvg(rendered.svg);
      } catch {
        if (!cancelled) setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  useEffect(() => {
    if (!expanded) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-xl border border-fd-border p-4 text-sm">{chart}</pre>
    );
  }

  return (
    <>
      <button
        aria-label="Expand diagram"
        className="group my-6 block w-full cursor-zoom-in overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4 text-left transition hover:border-fd-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        onClick={() => setExpanded(true)}
        type="button"
      >
        <div
          className="[&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid returns sanitized SVG generated from repository-controlled documentation charts.
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
        <span className="mt-3 block text-center text-xs text-fd-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Click to expand · Press Esc to close
        </span>
      </button>

      {expanded && svg ? (
        <dialog
          aria-label="Expanded diagram"
          className="fixed inset-0 m-0 flex h-dvh w-dvw max-h-none max-w-none items-center justify-center border-0 bg-black/70 p-4 backdrop-blur-sm"
          open
        >
          <div className="relative h-full max-h-full w-full max-w-none overflow-auto rounded-2xl border border-fd-border bg-fd-card p-4 shadow-2xl sm:p-8">
            <button
              aria-label="Close expanded diagram"
              className="sticky left-full top-0 z-10 mb-2 ml-auto flex size-9 items-center justify-center rounded-full border border-fd-border bg-fd-card text-lg text-fd-muted-foreground hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
              onClick={() => setExpanded(false)}
              ref={closeButtonRef}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
            <div
              className="[&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-none"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid returns sanitized SVG generated from repository-controlled documentation charts.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </dialog>
      ) : null}
    </>
  );
}
