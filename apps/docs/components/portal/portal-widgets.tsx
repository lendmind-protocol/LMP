"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  benchmarkScenarios,
  mindInstructionsMarkdown,
  mindProfiles,
  proofSummary,
  sourceReferences,
} from "@/lib/portal-data";
import {
  Bot,
  Check,
  Copy,
  Database,
  Download,
  Gauge,
  type LucideIcon,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import { sitePath } from "@/lib/site";
import { useState } from "react";

type PlaygroundProfile = {
  id: string;
  name: string;
  icon: LucideIcon;
  principle: string;
  baseline: string;
  reference: string;
  rule: string;
  threshold: string;
  fixtureResult: "pass" | "needs_revision";
  finding: string;
};

const playgroundProfiles: PlaygroundProfile[] = [
  {
    id: "standard",
    name: "Standard LLM",
    icon: Bot,
    principle: "Internet-average output with no active architectural policy.",
    baseline: `import express from "express";\nimport lodash from "lodash";\n\nconst app = express();\napp.get("/api", (req, res) => {\n  const rows = lodash.filter(loadRows(), (row) => row.tenantId === req.query.tenant);\n  res.json(rows);\n});`,
    reference: `import express from "express";\nimport lodash from "lodash";\n\nconst app = express();\napp.get("/api", (req, res) => {\n  const rows = lodash.filter(loadRows(), (row) => row.tenantId === req.query.tenant);\n  res.json(rows);\n});`,
    rule: "No active Mind selected",
    threshold: "Not applicable",
    fixtureResult: "needs_revision",
    finding: "No policy package is available to evaluate this candidate.",
  },
  {
    id: "vercel",
    name: "Vercel Edge-Routing",
    icon: Zap,
    principle: "Keep request paths small, native, and runtime-aware.",
    baseline: `import express from "express";\nimport lodash from "lodash";\n\nconst app = express();\napp.get("/api", (req, res) => {\n  const rows = lodash.filter(loadRows(), (row) => row.tenantId === req.query.tenant);\n  res.json(rows);\n});`,
    reference: `import polka from "polka";\nimport { request } from "undici";\n\nconst app = polka();\napp.get("/api", async (req, res) => {\n  const response = await request(process.env.DATA_URL);\n  res.end(await response.body.text());\n});`,
    rule: "EDGE_RUNTIME_BOUNDARY",
    threshold: "Request path must use the declared edge runtime contract",
    fixtureResult: "pass",
    finding: "The reference fixture satisfies the declared rule shape.",
  },
  {
    id: "supabase",
    name: "Supabase Data Isolation",
    icon: Database,
    principle: "Move tenant authorization to the database boundary with RLS.",
    baseline: `const rows = await db\n  .from("invoices")\n  .select("*")\n  .eq("tenant_id", request.headers.get("x-tenant"));\nreturn Response.json(rows);`,
    reference: `-- Policy is evaluated where the data lives.\ncreate policy "tenant isolation"\non public.invoices\nfor select using (tenant_id = auth.jwt() ->> 'tenant_id');\n\nconst { data } = await db.from("invoices").select("*");\nreturn Response.json(data);`,
    rule: "DATABASE_AUTHORIZATION_BOUNDARY",
    threshold: "Tenant authorization must be declared at the data boundary",
    fixtureResult: "pass",
    finding: "The reference fixture places tenant authorization in the database policy.",
  },
];

const onboardingOptions = [
  {
    label: "Agent framework",
    options: [
      ["claudecode", "Claude Code"],
      ["claudedesktop", "Claude Desktop"],
      ["cursor", "Cursor"],
      ["cline", "Roo Code / Cline"],
    ],
  },
  {
    label: "Project baseline",
    options: [
      ["greenfield", "Greenfield"],
      ["brownfield", "Brownfield"],
    ],
  },
  {
    label: "Target Mind",
    options: [
      ["tj-ponytail", "TJ Ponytail"],
      ["supabase-core", "Supabase Core"],
      ["linux-kernel", "Linux Kernel"],
    ],
  },
] as const;

export function ProtocolPlayground() {
  const [activeId, setActiveId] = useState("standard");
  const [code, setCode] = useState(playgroundProfiles[0].baseline);
  const selected =
    playgroundProfiles.find((profile) => profile.id === activeId) ?? playgroundProfiles[0];
  const edited = code !== selected.baseline;
  const fixtureResult = edited ? "not evaluated" : selected.fixtureResult;
  const selectProfile = (id: string) => {
    const next = playgroundProfiles.find((profile) => profile.id === id) ?? playgroundProfiles[0];
    setActiveId(next.id);
    setCode(next.baseline);
  };
  return (
    <Card className="not-prose my-8 overflow-hidden border-slate-800 bg-slate-950 text-slate-100 shadow-2xl dark">
      <CardHeader className="border-b border-slate-800 bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Workflow className="size-4 text-cyan-300" />
              Lending-Mind Protocol Playground
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-slate-400">
              A bounded fixture walkthrough. Select a profile to inspect the rule, candidate,
              reference shape, and result that a real local evaluation would record.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-slate-700 text-slate-300">
            Fixture walkthrough
          </Badge>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Policy contexts">
          {playgroundProfiles.map((profile) => {
            const Icon = profile.icon;
            const active = profile.id === activeId;
            return (
              <Button
                key={profile.id}
                variant="outline"
                role="tab"
                aria-selected={active}
                onClick={() => selectProfile(profile.id)}
                className={`h-auto justify-start gap-2 border-slate-700 py-3 text-left text-slate-200 hover:bg-slate-800 hover:text-white ${active ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "bg-slate-900"}`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{profile.name}</span>
                  <span className="block truncate text-[11px] font-normal text-slate-400">
                    {profile.principle}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Terminal className="size-4 text-cyan-300" />
              Workspace code contrast
            </div>
            <span className="max-w-full text-xs leading-5 text-slate-500">
              Editing marks the fixture as not evaluated; run the CLI for a real result
            </span>
          </div>
          <div className="grid overflow-hidden rounded-xl border border-slate-800 lg:grid-cols-2">
            <label
              className="border-b border-slate-800 lg:border-b-0 lg:border-r"
              htmlFor="playground-code"
            >
              <span className="flex items-center gap-2 border-b border-slate-800 bg-rose-950/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-rose-200">
                <span aria-hidden="true">×</span> Standard AI output
              </span>
              <textarea
                id="playground-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
                className="min-h-72 w-full resize-y border-0 bg-slate-950 p-4 font-mono text-xs leading-6 text-rose-100 outline-none ring-0 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
                aria-label="Editable unmanaged candidate source"
              />
            </label>
            <div>
              <div className="flex items-center gap-2 border-b border-slate-800 bg-emerald-950/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-emerald-200">
                <Check className="size-3.5" aria-hidden="true" /> Reference shape
              </div>
              <pre className="min-h-72 whitespace-pre-wrap break-words bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-100">
                <code>{selected.reference}</code>
              </pre>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <ShieldCheck className="size-4 text-cyan-300" /> Decision record preview
            </div>
            <Badge
              variant="outline"
              className={
                fixtureResult === "pass"
                  ? "border-emerald-500/50 text-emerald-300"
                  : fixtureResult === "needs_revision"
                    ? "border-rose-500/50 text-rose-300"
                    : "border-amber-500/50 text-amber-300"
              }
            >
              {fixtureResult === "pass"
                ? "FIXTURE: PASS"
                : fixtureResult === "needs_revision"
                  ? "FIXTURE: NEEDS REVISION"
                  : "EDITED: NOT EVALUATED"}
            </Badge>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Profile", selected.name],
              ["Rule", selected.rule],
              ["Declared threshold", selected.threshold],
              ["Scope", "Browser fixture only; no workspace files"],
              ["Finding", edited ? "Run the CLI or MCP evaluator after editing" : selected.finding],
              ["Runtime telemetry", "Not collected in the browser"],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3" key={label}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {label}
                </div>
                <div className="mt-1 text-slate-200">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <Terminal className="mt-0.5 size-4 shrink-0 text-cyan-300" />
            {selected.principle} This page does not rewrite code, run a parser, measure bundle size,
            or start Docker. The Rust CLI, daemon, and MCP server remain the decision authority.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MindVault() {
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const [language, setLanguage] = useState("all");
  const [discipline, setDiscipline] = useState("all");
  const [copied, setCopied] = useState<string | null>(null);
  const sourceById = new Map(sourceReferences.map((source) => [source.id, source]));
  const languages = [...new Set(mindProfiles.flatMap((mind) => mind.languages))].sort();
  const disciplines = [...new Set(mindProfiles.map((mind) => mind.discipline))].sort();
  const filtered = mindProfiles.filter(
    (mind) =>
      `${mind.name} ${mind.id} ${mind.focus}`.toLowerCase().includes(query.toLowerCase()) &&
      (availability === "all" || mind.availability === availability) &&
      (discipline === "all" || mind.discipline === discipline) &&
      (language === "all" || mind.languages.includes(language)),
  );
  const downloadInstructions = (mind: (typeof mindProfiles)[number]) => {
    const blob = new Blob([mindInstructionsMarkdown(mind)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${mind.id.replace("lmp:mind:", "lmp-")}-INSTRUCTIONS.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <div className="not-prose my-8 space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Find a Mind
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse profiles by purpose, language, and implementation state.
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {filtered.length} / {mindProfiles.length} profiles
          </span>
        </div>
        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid min-w-0 gap-2 text-sm font-medium" htmlFor="mind-vault-search">
            Search
            <input
              id="mind-vault-search"
              name="mind-search"
              type="search"
              autoComplete="off"
              aria-label="Search mind profiles"
              placeholder="Search by name, language, or focus…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 min-w-0 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium" htmlFor="mind-vault-discipline">
            Discipline
            <select
              id="mind-vault-discipline"
              name="mind-discipline"
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
              className="h-10 min-w-0 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All disciplines</option>
              {disciplines.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label
            className="grid min-w-0 gap-2 text-sm font-medium"
            htmlFor="mind-vault-availability"
          >
            Availability
            <select
              id="mind-vault-availability"
              name="mind-availability"
              value={availability}
              onChange={(event) => setAvailability(event.target.value)}
              className="h-10 min-w-0 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All states</option>
              <option>Public registry</option>
              <option>Bundled locally</option>
              <option>Catalog proposal</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium" htmlFor="mind-vault-language">
            Language
            <select
              id="mind-vault-language"
              name="mind-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="h-10 min-w-0 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All languages</option>
              {languages.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No profiles match those filters. Clear a filter or search for another language.
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((mind) => (
          <Card id={mind.id.replace("lmp:mind:", "")} key={mind.id}>
            <CardHeader>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>{mind.name}</CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">
                    {mind.id} · v{mind.version}
                  </CardDescription>
                </div>
                <div className="flex max-w-full flex-wrap justify-start gap-2 sm:justify-end">
                  <Badge variant="secondary">{mind.availability}</Badge>
                  <Badge variant="outline">{mind.discipline}</Badge>
                  <Badge variant="outline">{mind.verification}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">{mind.focus}</p>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Languages and runtimes
                </div>
                <div className="flex flex-wrap gap-2">
                  {mind.languages.map((language) => (
                    <Badge variant="outline" key={language}>
                      {language}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Axiom matrix
                </div>
                <div className="flex flex-wrap gap-2">
                  {mind.principles.map((item) => (
                    <Badge variant="secondary" key={item}>
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Negative-space guardrails
                </div>
                <div className="flex flex-wrap gap-2">
                  {mind.guardrails.map((item) => (
                    <code className="rounded bg-muted px-2 py-1 text-xs" key={item}>
                      {item}
                    </code>
                  ))}
                </div>
              </div>
              <div className="border-t pt-3 text-xs text-muted-foreground">
                <div className="mb-2">Source references:</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {mind.sourceIds.map((sourceId) => {
                    const source = sourceById.get(sourceId);
                    return source?.url ? (
                      <a
                        className="underline underline-offset-2 hover:text-foreground"
                        href={source.url}
                        rel="noreferrer"
                        target="_blank"
                        key={sourceId}
                      >
                        {source.publisher} · {source.kind}
                      </a>
                    ) : null;
                  })}
                </div>
                <p className="mt-2">
                  These are source-backed interpretations, not claims of authorship or endorsement
                  by the referenced maintainers or organizations.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <code className="min-w-0 flex-1 break-all text-xs">
                  lmp use {mind.id.replace("lmp:mind:", "")}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Copy ${mind.name} install command`}
                  onClick={() => {
                    const command = `lmp use ${mind.id.replace("lmp:mind:", "")}`;
                    void navigator.clipboard?.writeText(command);
                    setCopied(mind.id);
                  }}
                >
                  <Copy className="size-4" aria-hidden="true" />
                </Button>
                {copied === mind.id ? (
                  <span
                    className="text-xs text-emerald-700 dark:text-emerald-400"
                    aria-live="polite"
                  >
                    Copied
                  </span>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => downloadInstructions(mind)}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Export for AI Project
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function BenchmarkDashboard() {
  return (
    <Card className="not-prose my-8">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-4" />
              Benchmark evidence
            </CardTitle>
            <CardDescription>
              The current technical artifact is shown below; it is bounded evidence, not a
              release-clean artifact or a universal leaderboard claim.
            </CardDescription>
          </div>
          <Badge variant="outline">Technical run retained</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Matrix</div>
            <div className="mt-1 text-2xl font-semibold">64 paired</div>
            <div className="text-xs text-muted-foreground">repositories × task classes</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Claim type</div>
            <div className="mt-1 text-2xl font-semibold">Baseline / guided</div>
            <div className="text-xs text-muted-foreground">paired evaluation</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Current status
            </div>
            <div className="mt-1 text-2xl font-semibold">64/64 technical</div>
            <div className="text-xs text-muted-foreground">release claim still gated</div>
          </div>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Total proof inventory
            </div>
            <div className="mt-1 text-2xl font-semibold">100+</div>
            <div className="text-xs text-muted-foreground">
              qualification, OSS, and internal demos
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Qualification lane
            </div>
            <div className="mt-1 text-2xl font-semibold">{proofSummary.qualification}</div>
            <div className="text-xs text-muted-foreground">Docker adds the conditional case</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Internal demos
            </div>
            <div className="mt-1 text-2xl font-semibold">{proofSummary.internalDemos}</div>
            <div className="text-xs text-muted-foreground">
              public repositories with Mind trade-offs
            </div>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-lg border">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="border-b px-3 py-2 text-left text-xs text-muted-foreground">
              Representative sample: 8 task/repository pairs from the complete 64-scenario OSS
              benchmark.
            </caption>
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">Repository</th>
                <th className="p-3">Task class</th>
                <th className="p-3">Evidence required</th>
              </tr>
            </thead>
            <tbody>
              {benchmarkScenarios.map(([repo, task]) => (
                <tr className="border-t" key={repo}>
                  <td className="break-words p-3 font-medium">{repo}</td>
                  <td className="break-words p-3">{task}</td>
                  <td className="break-words p-3 text-muted-foreground">
                    Pinned revision, source digest, baseline and guided result
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm">
          <a className="font-medium underline underline-offset-2" href={sitePath("/docs/reference/results")}>
            View the complete qualification, OSS benchmark, and internal demo matrix →
          </a>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          This is deliberately not a fabricated SWE-bench or HumanEval leaderboard. The repository’s
          real-world runner writes evidence only after the isolated OSS scenarios execute.
        </p>
      </CardContent>
    </Card>
  );
}

export function OnboardingSelector() {
  const [agent, setAgent] = useState("claudecode");
  const [strategy, setStrategy] = useState("brownfield");
  const [mind, setMind] = useState("supabase-core");
  const command = `npx create-lmp --agent ${agent} --strategy ${strategy} --mind ${mind}`;
  const [copied, setCopied] = useState(false);
  return (
    <Card className="not-prose my-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="size-4" />
          Onboarding configurator
        </CardTitle>
        <CardDescription>
          Generate the intended setup shape for an agent, repository, and Mind profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          {onboardingOptions.map(({ label, options }, index) => {
            const value = index === 0 ? agent : index === 1 ? strategy : mind;
            const setter = index === 0 ? setAgent : index === 1 ? setStrategy : setMind;
            return (
              <label className="grid gap-2 text-sm font-medium" key={label}>
                {label}
                <select
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {options.map(([option, text]) => (
                    <option value={option} key={option}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Generated command preview
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-words text-xs whitespace-pre-wrap">
              {command}
            </code>
            <Button
              size="icon"
              variant="outline"
              aria-label="Copy generated command"
              onClick={() => {
                void navigator.clipboard?.writeText(command);
                setCopied(true);
              }}
            >
              <Copy className="size-4" />{" "}
            </Button>
          </div>
          {copied && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">Copied.</p>}
        </div>
        <p className="text-xs text-muted-foreground">
          `create-lmp` accepts these selector flags, verifies the selected Mind signature, detects
          the workspace shape, and refuses a mismatched greenfield/brownfield choice unless the user
          explicitly overrides it.
        </p>
      </CardContent>
    </Card>
  );
}
