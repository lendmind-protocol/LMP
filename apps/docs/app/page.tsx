import { AgentVendorCarousel } from "@/components/landing/agent-vendor-carousel";
import { BrainField } from "@/components/landing/brain-field";
import { CommandCopy } from "@/components/landing/command-copy";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { MindVaultPreview } from "@/components/landing/mind-vault-preview";
import { ArrowRight, ArrowUpRight, Terminal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const disciplines = [
  ["Rust", "Ownership, systems safety, and bounded complexity", "/docs/architecture/overview"],
  ["TypeScript", "Strict contracts and maintainable application code", "/docs/guides/installation"],
  ["Go", "Readable composition and explicit error handling", "/docs/reference/mind-vault"],
  [
    "Databases",
    "Data locality, authorization, and migration discipline",
    "/docs/reference/mind-vault",
  ],
  [
    "Infrastructure",
    "Reproducible systems and visible operational drift",
    "/docs/architecture/overview",
  ],
  [
    "Agent integration",
    "A local connection with a visible decision boundary",
    "/docs/guides/mcp-integration",
  ],
] as const;

function ExternalMark() {
  return <ArrowUpRight aria-hidden="true" className="size-3.5" />;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
      {children}
    </div>
  );
}

function CodeQualityDiffPreview() {
  return (
    <div className="min-w-0 border-t border-white/10 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionLabel>Code-quality diff</SectionLabel>
          <p className="mt-2 text-sm text-white/45">
            The same review becomes explicit, scoped, and recorded.
          </p>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400">
          Selected scope
        </span>
      </div>
      <div className="mt-5 grid min-w-0 border border-white/10 sm:grid-cols-2">
        <div className="min-w-0 border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
          <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
            <span>Without LMP</span>
            <span className="text-white/30">Implicit</span>
          </div>
          <pre className="mt-4 overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-6 text-white/55">
            <code>
              <span className="text-red-600">- return check(files);</span>
              {"\n"}
              <span className="text-red-600">{"- // scope and rule evidence are implicit"}</span>
            </code>
          </pre>
        </div>
        <div className="min-w-0 p-4">
          <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
            <span>With LMP</span>
            <span className="text-emerald-400">Recorded</span>
          </div>
          <pre className="mt-4 overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-6 text-white/75">
            <code>
              <span className="text-emerald-600">
                + const findings = check(selectedFiles, policy);
              </span>
              {"\n"}
              <span className="text-emerald-600">
                {"+ // evidence is serialized with the result"}
              </span>
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="lmp-landing min-h-svh overflow-x-hidden bg-[#090a0b] text-[#f3f4f3]">
      <header>
        <div className="mx-auto flex min-h-16 min-w-0 max-w-[1180px] items-center justify-between gap-3 px-[clamp(1rem,4vw,2rem)]">
          <Link
            href="/"
            aria-label="LMP home"
            className="inline-flex min-h-11 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Image
              src="/logo.png"
              alt=""
              width={25}
              height={25}
              className="size-[25px] rounded-md"
              style={{ width: 25, height: 25 }}
              priority
            />
            <span className="font-mono text-sm font-semibold">lending-mind</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-white/40 sm:inline">
              protocol / 0.1.0
            </span>
          </Link>
          <nav
            aria-label="Primary"
            className="flex min-w-0 items-center gap-0.5 border-0 font-mono text-[clamp(0.625rem,1.7vw,0.6875rem)] uppercase tracking-[0.1em] text-white/55"
          >
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center rounded-sm px-[clamp(0.5rem,2vw,0.75rem)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Docs
            </Link>
            <Link
              href="/docs/reference/mind-vault"
              className="hidden min-h-11 items-center rounded-sm px-[clamp(0.5rem,2vw,0.75rem)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:inline-flex"
            >
              Mind Vault
            </Link>
            <a
              href="https://github.com/lendmind-protocol/LMP"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 rounded-sm px-[clamp(0.5rem,2vw,0.75rem)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <img
                src="https://cdn.simpleicons.org/github/000000"
                alt=""
                className="size-3.5 object-contain"
                loading="lazy"
              />
              GitHub <ExternalMark />
            </a>
          </nav>
        </div>
      </header>

      <section className="border-b border-white/10 px-[clamp(1rem,4vw,2rem)] py-[clamp(3rem,9vw,6rem)]">
        <div className="mx-auto grid min-w-0 max-w-[1180px] gap-[clamp(3rem,7vw,4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-end">
          <div className="min-w-0">
            <h1 className="mt-0 max-w-4xl text-pretty font-mono text-[clamp(2.35rem,10vw,6.2rem)] font-medium leading-[0.94] tracking-[-0.08em]">
              Make engineering judgment executable.
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-white/60 sm:text-lg">
              LMP turns explicit engineering preferences, trade-offs, and source evidence into
              signed policy packages that local agent workflows can evaluate.
            </p>
            <div className="mt-9 flex min-h-14 max-w-xl items-center gap-3 border border-white/15 bg-white/[0.035] px-4 text-left shadow-2xl shadow-black/20">
              <Terminal aria-hidden="true" className="size-4 shrink-0 text-emerald-400" />
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-white/90">
                npx lmp init
              </code>
              <CommandCopy command="npx lmp init" />
            </div>
            <AgentVendorCarousel />
          </div>
          <div className="min-w-0 lg:pb-2">
            <div aria-label="Animated mind portrait">
              <BrainField />
            </div>
            <div>
              <SectionLabel>What LMP changes</SectionLabel>
              <p className="mt-4 font-mono text-xl leading-8 text-white/85">
                A preference becomes a package, a decision becomes a result, and a result keeps its
                evidence.
              </p>
              <Link
                href="/docs/concepts/overview"
                className="mt-6 inline-flex min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-emerald-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Read the protocol <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid min-w-0 max-w-[1180px] grid-cols-2 divide-x divide-white/10 sm:grid-cols-5">
          {[
            ["VERSION", "0.1.0"],
            ["AUTHORITY", "RUST CORE"],
            ["STORAGE", "LOCAL-FIRST"],
            ["INTEGRITY", "SIGNED"],
            ["OUTPUT", "EVIDENCE"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 border-b border-white/10 px-[clamp(1rem,4vw,1.5rem)] py-4 last:border-b-0 sm:border-b-0"
            >
              <div className="font-mono text-[9px] tracking-[0.16em] text-white/35">{label}</div>
              <div className="mt-2 font-mono text-[11px] text-emerald-400">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] border-x border-b border-white/10">
        <div className="grid min-w-0 gap-8 p-[clamp(1rem,4vw,2rem)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-0">
          <div className="min-w-0 lg:pr-8">
            <SectionLabel>The distinction</SectionLabel>
            <h2 className="mt-4 font-mono text-3xl tracking-[-0.05em]">
              From preference to decision.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/55">
              LMP makes a declared policy and its selected scope inspectable, so the result can
              carry its evidence.
            </p>
          </div>
          <div className="min-w-0 border-t border-white/10 pt-5 lg:border-l lg:border-t-0 lg:px-8 lg:pt-0">
            <SectionLabel>Last fixture run</SectionLabel>
            <h2 className="mt-4 font-mono text-2xl tracking-[-0.05em]">Inspect the record.</h2>
            <p className="mt-4 text-sm leading-7 text-white/55">
              See what was loaded, checked, and recorded.
            </p>
            <Link
              href="/docs/reference/results"
              className="mt-6 inline-flex min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-emerald-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Read results <ExternalMark />
            </Link>
          </div>
          <CodeQualityDiffPreview />
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] border-x border-b border-white/10">
        <MindVaultPreview />
      </section>

      <section className="mx-auto max-w-[1180px] border-x border-b border-white/10">
        <div className="p-5 sm:p-8">
          <div className="flex items-end justify-between gap-5">
            <div>
              <SectionLabel>Browse by practice</SectionLabel>
              <h2 className="mt-4 font-mono text-3xl tracking-[-0.05em]">
                Find the discipline you need.
              </h2>
            </div>
            <Link
              href="/docs/reference/mind-vault"
              className="hidden min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/55 hover:text-emerald-400 sm:inline-flex"
            >
              All topics <ExternalMark />
            </Link>
          </div>
          <div className="mt-8 grid border-l border-t border-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {disciplines.map(([title, description, href]) => (
              <Link
                href={href}
                key={title}
                className="group min-h-40 border-b border-r border-white/10 p-5 transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
              >
                <span className="font-mono text-sm text-white/80">{title}</span>
                <p className="mt-3 text-sm leading-6 text-white/45">{description}</p>
                <span className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-400 opacity-70 transition-opacity group-hover:opacity-100">
                  Explore <ArrowRight aria-hidden="true" className="size-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1180px] border-x border-b border-white/10">
        <div className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link
            href="/docs/concepts/overview"
            className="group p-5 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 sm:p-6"
          >
            <span className="font-mono text-sm text-white/80">Evaluate LMP</span>
            <p className="mt-3 text-sm leading-6 text-white/45">
              Understand the protocol, boundaries, and evidence model.
            </p>
            <span className="mt-6 inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-400">
              Start here <ArrowRight aria-hidden="true" className="size-3" />
            </span>
          </Link>
          <Link
            href="/docs/guides/installation"
            className="group p-5 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 sm:p-6"
          >
            <span className="font-mono text-sm text-white/80">Integrate LMP</span>
            <p className="mt-3 text-sm leading-6 text-white/45">
              Install the toolchain and connect a local agent.
            </p>
            <span className="mt-6 inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-400">
              Start here <ArrowRight aria-hidden="true" className="size-3" />
            </span>
          </Link>
          <Link
            href="/docs/concepts/mind-packages"
            className="group p-5 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 sm:p-6"
          >
            <span className="font-mono text-sm text-white/80">Author a Mind</span>
            <p className="mt-3 text-sm leading-6 text-white/45">
              Collect evidence, define rules, and sign a package.
            </p>
            <span className="mt-6 inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-400">
              Start here <ArrowRight aria-hidden="true" className="size-3" />
            </span>
          </Link>
        </div>
      </section>
      <FaqAccordion />

      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-[clamp(1rem,4vw,2rem)] py-8 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
        <span>Local-first policy runtime / v0.1.0</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/docs/operations/roadmap" className="hover:text-white">
            Roadmap
          </Link>
          <Link href="/docs/operations/security" className="hover:text-white">
            Security
          </Link>
          <Link href="/docs/reference/versioning" className="hover:text-white">
            Release notes
          </Link>
          <a
            href="https://github.com/lendmind-protocol/LMP"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-white"
          >
            GitHub <ExternalMark />
          </a>
        </div>
      </footer>
    </main>
  );
}
