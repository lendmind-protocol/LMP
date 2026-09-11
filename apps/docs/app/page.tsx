import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { ArrowRight, BookOpen, Check, Code2, GitBranch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { baseOptions } from "./layout.config";

const sections = [
  {
    title: "Understand LMP",
    href: "/docs/concepts/overview",
    description: "Learn the protocol model, package lifecycle, and enforcement boundary.",
  },
  {
    title: "Build with LMP",
    href: "/docs/getting-started",
    description: "Install the toolchain, create a Mind package, and run your first evaluation.",
  },
  {
    title: "Look up the details",
    href: "/docs/reference/cli",
    description: "Find CLI commands, schemas, exit states, and integration contracts.",
  },
  {
    title: "Operate with evidence",
    href: "/docs/operations/benchmark-analytics",
    description: "Run benchmarks, manage caches, secure signing, and investigate failures.",
  },
] as const;

const portalLayers = [
  [
    "Manifesto",
    "/docs/concepts/problem-space",
    "The fluency-versus-wisdom problem and the evidence trail.",
  ],
  [
    "Protocol playground",
    "/docs/guides/playground",
    "Compare Mind constraints and inspect a deterministic preview.",
  ],
  [
    "Mind Vault",
    "/docs/reference/mind-vault",
    "Browse checked-in profiles, guardrails, and provenance.",
  ],
  [
    "Architecture",
    "/docs/architecture/overview",
    "Trace Rust, Python orchestration, Docker, and MCP.",
  ],
  [
    "Benchmark analytics",
    "/docs/operations/benchmark-analytics",
    "Understand what a trustworthy paired benchmark must contain.",
  ],
  [
    "Getting started onboarding",
    "/docs/getting-started",
    "Choose an agent, baseline, and target Mind.",
  ],
] as const;

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Lending-Mind Protocol</Badge>
          <span className="text-sm text-muted-foreground">Documentation</span>
        </div>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
          Make code-quality preferences executable.
        </h1>
        <p className="mt-7 max-w-3xl text-xl leading-8 text-muted-foreground">
          LMP compiles explicit engineering philosophies, trade-offs, and rules into signed policy
          artifacts that agents and local tooling can evaluate deterministically.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button nativeButton={false} size="lg" render={<Link href="/docs/getting-started" />}>
            Start building <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            nativeButton={false}
            size="lg"
            variant="outline"
            render={<Link href="/docs/concepts/overview" />}
          >
            Understand the protocol
          </Button>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck aria-hidden="true" />
              </div>
              <CardTitle>Policy becomes evidence</CardTitle>
              <CardDescription>
                A Mind package turns preferences into explicit rules that can be validated, signed,
                and evaluated.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No hidden prompt assumptions. The protocol records what was loaded, which rules
              applied, and why a result passed or failed.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-secondary">
                <GitBranch aria-hidden="true" />
              </div>
              <CardTitle>Delta-aware</CardTitle>
              <CardDescription>
                Evaluate changed code without reprocessing the entire repository.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Separator className="my-16" />
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Link
              className="group block cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={section.href}
              key={section.href}
            >
              <Card className="h-full transition-colors duration-200 group-hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {section.title}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Badge variant="outline">Portal blueprint</Badge>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                See the whole protocol, not just the markdown
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Six connected surfaces explain the problem, let you explore the loop, expose the
                registry, and show exactly what evidence is available.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {portalLayers.map(([title, href, description]) => (
              <Link
                className="group block cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                href={href}
                key={href}
              >
                <Card className="h-full transition-colors duration-200 group-hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      {title}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-16 rounded-xl border bg-muted/30 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border">
              <Code2 className="size-5" />
            </div>
            <div>
              <h2 className="font-semibold">A predictable path from philosophy to proof</h2>
              <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                {[
                  "Define preferences and source evidence.",
                  "Compile and validate a Mind package.",
                  "Evaluate changes and inspect results.",
                ].map((step) => (
                  <div className="flex gap-2" key={step}>
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen aria-hidden="true" className="size-4" />
          Read the protocol from concepts through operations.
        </p>
      </main>
    </HomeLayout>
  );
}
