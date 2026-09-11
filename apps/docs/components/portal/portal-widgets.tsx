"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  benchmarkScenarios,
  mindProfiles,
  proofSummary,
  sourceReferences,
} from "@/lib/portal-data";
import {
  Bot,
  Check,
  Copy,
  Database,
  Gauge,
  type LucideIcon,
  Package,
  ShieldCheck,
  Terminal,
  Timer,
  Workflow,
  Zap,
} from "lucide-react";
import { useState } from "react";

type PlaygroundProfile = {
  id: string;
  name: string;
  icon: LucideIcon;
  principle: string;
  baseline: string;
  enforced: string;
  complexity: number;
  bundleBytes: number;
  latencyMs: number;
  compliant: boolean;
};

const playgroundProfiles: PlaygroundProfile[] = [
  {
    id: "standard",
    name: "Standard LLM",
    icon: Bot,
    principle: "Internet-average output with no active architectural policy.",
    baseline: `import express from "express";\nimport lodash from "lodash";\n\nconst app = express();\napp.get("/api", (req, res) => {\n  const rows = lodash.filter(loadRows(), (row) => row.tenantId === req.query.tenant);\n  res.json(rows);\n});`,
    enforced: `import express from "express";\nimport lodash from "lodash";\n\nconst app = express();\napp.get("/api", (req, res) => {\n  const rows = lodash.filter(loadRows(), (row) => row.tenantId === req.query.tenant);\n  res.json(rows);\n});`,
    complexity: 9,
    bundleBytes: 2_400_000,
    latencyMs: 142,
    compliant: false,
  },
  {
    id: "vercel",
    name: "Vercel Edge-Routing",
    icon: Zap,
    principle: "Keep request paths small, native, and runtime-aware.",
    baseline: `import express from "express";\nimport lodash from "lodash";\n\nconst app = express();\napp.get("/api", (req, res) => {\n  const rows = lodash.filter(loadRows(), (row) => row.tenantId === req.query.tenant);\n  res.json(rows);\n});`,
    enforced: `import polka from "polka";\nimport { request } from "undici";\n\nconst app = polka();\napp.get("/api", async (req, res) => {\n  const response = await request(process.env.DATA_URL);\n  res.end(await response.body.text());\n});`,
    complexity: 3,
    bundleBytes: 12_000,
    latencyMs: 8.5,
    compliant: true,
  },
  {
    id: "supabase",
    name: "Supabase Data Isolation",
    icon: Database,
    principle: "Move tenant authorization to the database boundary with RLS.",
    baseline: `const rows = await db\n  .from("invoices")\n  .select("*")\n  .eq("tenant_id", request.headers.get("x-tenant"));\nreturn Response.json(rows);`,
    enforced: `-- Policy is evaluated where the data lives.\ncreate policy "tenant isolation"\non public.invoices\nfor select using (tenant_id = auth.jwt() ->> 'tenant_id');\n\nconst { data } = await db.from("invoices").select("*");\nreturn Response.json(data);`,
    complexity: 2,
    bundleBytes: 0,
    latencyMs: 1.4,
    compliant: true,
  },
];

const meterWidth = (value: number, maximum: number) =>
  `${Math.min(100, Math.max(4, (value / maximum) * 100))}%`;

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 KB (native)";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

const onboardingOptions = [
  {
    label: "Agent framework",
    options: [
      ["claudecode", "Claude Code"],
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
  const complexity = Math.min(10, Math.max(1, selected.complexity + (edited ? -1 : 0)));
  const bundleBytes =
    selected.compliant && edited ? Math.max(0, selected.bundleBytes - 2_000) : selected.bundleBytes;
  const latencyMs =
    selected.compliant && edited ? Math.max(0.8, selected.latencyMs - 0.5) : selected.latencyMs;
  const isCompliant = selected.compliant && edited;
  const selectProfile = (id: string) => {
    const next = playgroundProfiles.find((profile) => profile.id === id) ?? playgroundProfiles[0];
    setActiveId(next.id);
    setCode(next.baseline);
  };
  const telemetryRows: Array<{
    label: string;
    value: string;
    width: string;
    good: boolean;
    icon: LucideIcon;
  }> = [
    {
      label: "Logic complexity ceiling",
      value: `${complexity}/10`,
      width: meterWidth(complexity, 10),
      good: complexity <= 4,
      icon: Gauge,
    },
    {
      label: "Bundle weight footprint",
      value: formatBytes(bundleBytes),
      width: meterWidth(bundleBytes, 2_400_000),
      good: bundleBytes <= 20_000,
      icon: Package,
    },
    {
      label: "Edge cold-start latency",
      value: `${latencyMs} ms`,
      width: meterWidth(latencyMs, 142),
      good: latencyMs <= 10,
      icon: Timer,
    },
  ];
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
              A deterministic browser simulation of the policy decision: compare an unguided
              candidate with the enforced result and watch the telemetry shift.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-slate-700 text-slate-300">
            Browser simulation
          </Badge>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Mind archetypes">
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Terminal className="size-4 text-cyan-300" />
              Workspace code contrast
            </div>
            <span className="text-xs text-slate-500">
              Edit the left pane to simulate a changed candidate
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
                <Check className="size-3.5" aria-hidden="true" /> LMP enforced code
              </div>
              <pre className="min-h-72 overflow-x-auto bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-100">
                <code>{selected.enforced}</code>
              </pre>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Gauge className="size-4 text-cyan-300" /> Live telemetry profiler
            </div>
            <Badge
              variant="outline"
              className={
                isCompliant
                  ? "border-emerald-500/50 text-emerald-300"
                  : "border-rose-500/50 text-rose-300"
              }
            >
              {isCompliant
                ? "STATUS: VERIFIED SECURE & OPTIMIZED"
                : "STATUS: CRITICAL_AXIOM_VIOLATION"}
            </Badge>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {telemetryRows.map(({ label, value, width, good, icon: Icon }) => (
              <div key={label}>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Icon className="size-3.5" />
                    {label}
                  </span>
                  <span className={good ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>
                    {value}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-800"
                  role="progressbar"
                  tabIndex={0}
                  aria-label={label}
                  aria-valuenow={good ? 25 : 90}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${good ? "bg-emerald-400" : "bg-rose-400"}`}
                    style={{ width }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan-300" />
            {selected.principle} The Rust daemon and Docker sandbox remain the production authority;
            this browser view is a deterministic visual explorer.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MindVault() {
  const [query, setQuery] = useState("");
  const sourceById = new Map(sourceReferences.map((source) => [source.id, source]));
  const filtered = mindProfiles.filter((mind) =>
    `${mind.name} ${mind.id} ${mind.focus}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="not-prose my-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Mind Vault</h3>
          <p className="text-sm text-muted-foreground">
            {mindProfiles.length} profiles ·{" "}
            {mindProfiles.filter((mind) => mind.availability === "Public registry").length} public
            registry ·{" "}
            {mindProfiles.filter((mind) => mind.availability === "Bundled locally").length} bundled
            locally ·{" "}
            {mindProfiles.filter((mind) => mind.availability === "Catalog proposal").length} catalog
            proposals
          </p>
        </div>
        <input
          aria-label="Search mind profiles"
          placeholder="Search profiles"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-64"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((mind) => (
          <Card key={mind.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{mind.name}</CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">
                    {mind.id} · v{mind.version}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant="secondary">{mind.availability}</Badge>
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
          <Badge variant="outline">Technical benchmark verified</Badge>
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
            <div className="mt-1 text-2xl font-semibold">64/64 verified</div>
            <div className="text-xs text-muted-foreground">dirty checkout; no release claim</div>
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
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
                  <td className="p-3 font-medium">{repo}</td>
                  <td className="p-3">{task}</td>
                  <td className="p-3 text-muted-foreground">
                    Pinned revision, source digest, baseline and guided result
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm">
          <a
            className="font-medium underline underline-offset-2"
            href="/docs/reference/proof-matrix"
          >
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
        <div className="grid gap-3 md:grid-cols-3">
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
            Generated command · verified selector interface
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto text-xs">{command}</code>
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
