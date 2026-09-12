"use client";

import { sitePath } from "@/lib/site";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const minds = [
  [
    "TJ Ponytail Minimalism",
    "tj-ponytail",
    "TypeScript / Node.js",
    "Verified",
    "Source-backed package",
  ],
  ["Supabase Data Isolation", "supabase-core", "SQL / TypeScript", "Verified", "Community package"],
  ["Linux Kernel Defensive", "linux-kernel", "Rust / C", "Community", "Community proposal"],
  [
    "Vercel Edge Delivery",
    "vercel-edge",
    "TypeScript / JavaScript",
    "Community",
    "Community proposal",
  ],
] as const;

export function MindVaultPreview() {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => minds.filter((mind) => mind.join(" ").toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  return (
    <div>
      <div className="border-b border-white/10 p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
              Mind Vault
            </div>
            <h2 className="mt-4 font-mono text-3xl tracking-[-0.05em]">
              Browse declared points of view.
            </h2>
            <p className="mt-3 text-sm text-white/50">
              Inspect provenance and package status before selecting a Mind.
            </p>
          </div>
          <Link
            href={sitePath("/docs/reference/mind-vault")}
            className="inline-flex min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/65 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Open the vault <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <label className="mt-7 flex min-h-11 max-w-xl items-center gap-3 border border-white/15 px-3 text-left text-white/45 focus-within:border-emerald-400">
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only">Search the Mind Vault</span>
          <input
            aria-label="Search the Mind Vault"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white outline-none placeholder:text-white/40"
            placeholder="Search minds, languages, or principles..."
          />
        </label>
      </div>
      <div className="divide-y divide-white/10">
        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_10rem_10rem_6rem] gap-4 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35 sm:grid sm:px-8">
          <span>#</span>
          <span>Mind</span>
          <span>Stack</span>
          <span>Provenance</span>
          <span>Status</span>
        </div>
        {visible.length ? (
          visible.map(([name, id, stack, status, provenance], index) => (
            <Link
              href={sitePath(`/docs/reference/mind-vault#${id}`)}
              key={id}
              className="grid min-h-20 gap-3 px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 sm:grid-cols-[2rem_minmax(0,1fr)_10rem_10rem_6rem] sm:items-center sm:gap-4 sm:px-8"
            >
              <span className="font-mono text-xs text-white/30">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block font-mono text-sm text-white/80">{name}</span>
                <span className="mt-1 block font-mono text-[10px] text-emerald-400">
                  lmp:mind:{id}
                </span>
              </span>
              <span className="font-mono text-[11px] text-white/45">{stack}</span>
              <span className="font-mono text-[10px] text-white/40">{provenance}</span>
              <span
                className={
                  status === "Verified"
                    ? "font-mono text-[10px] text-emerald-400"
                    : "font-mono text-[10px] text-amber-300"
                }
              >
                {status}
              </span>
            </Link>
          ))
        ) : (
          <div className="px-5 py-8 font-mono text-xs text-white/55 sm:px-8">
            No Mind matches “{query}”. Try a language, identifier, or principle.
          </div>
        )}
      </div>
    </div>
  );
}
