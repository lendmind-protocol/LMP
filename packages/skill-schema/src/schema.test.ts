import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CanonicalMindPackageSchema,
  EngineeringProfileSourceSchema,
  EvaluationArtifactSchema,
  EvidenceManifestSchema,
  MindPackageSchema,
  PromotionProposalSchema,
  ReleaseMetadataSchema,
  RuleContractManifestSchema,
  RuleContractSchema,
  exportJsonSchema,
  validateMindPackage,
} from "./index.js";

describe("mind package schema", () => {
  it("accepts a package and exports a dependency-free JSON Schema", async () => {
    const packageValue = { id: "lmp:skill:test", version: "1.0.0", rules: [{ id: "minimal" }] };
    expect(MindPackageSchema.parse(packageValue)).toEqual(packageValue);
    expect(exportJsonSchema().required).toContain("$schema");
    const directory = await mkdtemp(join(tmpdir(), "lmp-schema-"));
    await writeFile(join(directory, "mind.json"), JSON.stringify(packageValue));
    await expect(validateMindPackage(directory)).resolves.toMatchObject({ valid: true });
    await rm(directory, { recursive: true, force: true });
  });

  it("reports invalid package directories and fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-schema-"));
    await writeFile(join(directory, "mind.json"), JSON.stringify({ version: "1.0.0" }));
    const result = await validateMindPackage(directory);
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.path).toContain("id");
    await rm(directory, { recursive: true, force: true });
  });

  it("requires the canonical contract fields and rejects false community verification", () => {
    const canonical = {
      $schema: "https://lendingmind.org/schemas/mind.json",
      specVersion: "1.0",
      id: "lmp:mind:example",
      version: "1.0.0",
      name: "Example",
      description: "A test profile",
      modeDefaults: { validation: "advisory" as const, network: "offline" as const },
      author: {
        kind: "community-archetype",
        displayName: "Community",
        verified: false,
        website: null,
      },
      provenance: {
        sources: [
          {
            title: "Project notes",
            url: "https://example.com/source",
            licenseNote: "Public",
            evidenceTier: "primary" as const,
            rights: "public-documentation" as const,
            sourceType: "documentation" as const,
            accessMethod: "public-http" as const,
            contentDigest: `sha256:${"a".repeat(64)}`,
            retentionPolicy: "metadata-only",
            allowedUse: "summarize-public-guidance",
          },
        ],
        attributionRequired: true,
      },
      philosophy: {
        principles: ["Prefer simple boundaries"],
        tradeoffs: ["More explicit configuration"],
        decisionRules: ["Measure before changing"],
        antiPatterns: ["Unbounded scope"],
      },
      capabilities: { languages: ["rust"], requiredAgentTools: ["lmp.evaluate"] },
      enforcement: { complexity: "bounded" },
    };
    expect(CanonicalMindPackageSchema.parse(canonical)).toEqual(canonical);
    expect(() =>
      CanonicalMindPackageSchema.parse({
        ...canonical,
        author: { ...canonical.author, verified: true },
      }),
    ).toThrow(/community archetypes are not verified/);
    expect(() => CanonicalMindPackageSchema.parse({ ...canonical, philosophy: undefined })).toThrow(
      /philosophy is required/,
    );
    expect(() => CanonicalMindPackageSchema.parse({ ...canonical, version: "1" })).toThrow(
      /semantic versioning/,
    );
  });

  it("validates evidence and promotion records as strict, machine-readable contracts", () => {
    expect(
      EvidenceManifestSchema.parse({
        status: "verified-fixtures",
        tests: [
          { id: "clean", kind: "positive", description: "clean source", expected: "pass" },
          {
            id: "violation",
            kind: "negative",
            description: "policy violation",
            expected: "needs_revision",
          },
          {
            id: "exception",
            kind: "exception",
            description: "explicitly bounded exception",
            expected: "blocked",
          },
        ],
        notes: "Fixtures are reviewed alongside the profile.",
      }),
    ).toMatchObject({ status: "verified-fixtures" });
    expect(() =>
      EvidenceManifestSchema.parse({
        status: "verified-fixtures",
        tests: [{ id: "clean", kind: "positive", description: "clean source", expected: "pass" }],
        notes: "incomplete",
      }),
    ).toThrow(/negative fixture/);

    const artifact = {
      artifactVersion: "1.1",
      runId: "run-1",
      createdAt: "2026-09-11T00:00:00.000Z",
      workspace: {
        pathHash: `sha256:${"a".repeat(64)}`,
        gitHead: null,
        dirty: false,
        scope: {
          changedOnly: true,
          source: "git-diff",
          checkedFiles: 2,
          fallbackReason: null,
        },
      },
      mind: {
        id: "lmp:mind:example",
        version: "1.0.0",
        contentDigest: `sha256:${"b".repeat(64)}`,
        signatureStatus: "verified" as const,
        layers: [{ name: "guidance.md", digest: `sha256:${"c".repeat(64)}` }],
      },
      mode: "enforced" as const,
      state: "pass" as const,
      summary: {
        status: "pass" as const,
        hardViolationCount: 0,
        warningCount: 0,
        informationalCount: 0,
      },
      checks: [],
      skippedChecks: [{ checkId: "behavioral.docker", reason: "not requested" }],
      analysis: {
        languages: ["rust", "typescript"],
        parsers: ["syn-2", "line-policy-v1"],
        versions: ["2021", "syntax-version-agnostic"],
        checkedFiles: 2,
      },
      loopTransitions: [{ state: "evaluating", event: "evaluation_started" }],
      commands: [],
      limitations: [],
      environment: { rust: "1.75" },
      privacy: { sourceCodeIncluded: false, rawPathsIncluded: false, networkUsed: false },
    };
    expect(EvaluationArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(() =>
      EvaluationArtifactSchema.parse({
        ...artifact,
        privacy: { ...artifact.privacy, extra: true },
      }),
    ).toThrow();

    const proposal = {
      proposalId: "proposal-1",
      profileId: "lmp:mind:example",
      profileVersion: "1.0.0",
      selectedArtifacts: ["artifacts/run-1.json"],
      candidateChanges: [{ rule: "complexity" }],
      rationale: "The artifact demonstrates a repeatable improvement.",
      expectedBenefit: "Reduce repeatable architectural violations.",
      falsePositiveRisk: "A narrow fixture review is required before promotion.",
      requiredVersionBump: "minor" as const,
      requiredTests: ["cargo test --workspace"],
      benchmarkPlan: ["Run the baseline and enforced scenarios."],
      approver: null,
      status: "draft" as const,
      createdAt: "2026-09-11T00:00:00.000Z",
    };
    expect(PromotionProposalSchema.parse(proposal)).toEqual(proposal);
    expect(() => PromotionProposalSchema.parse({ ...proposal, selectedArtifacts: [] })).toThrow();
    expect(() => PromotionProposalSchema.parse({ ...proposal, expectedBenefit: "" })).toThrow();
    expect(() =>
      PromotionProposalSchema.parse({ ...proposal, requiredVersionBump: "invalid" }),
    ).toThrow();
    expect(() =>
      PromotionProposalSchema.parse({
        ...proposal,
        status: "accepted",
        decisionReason: "approved",
      }),
    ).toThrow(/require an approver/);
    expect(() =>
      PromotionProposalSchema.parse({ ...proposal, status: "rejected", approver: "maintainer" }),
    ).toThrow(/require a decision reason/);
    expect(() =>
      PromotionProposalSchema.parse({
        ...proposal,
        status: "under-review",
        approver: "maintainer",
      }),
    ).toThrow(/cannot have an approver/);
  });

  it("validates the canonical zero-config profile source shape", () => {
    const source = {
      engineering_philosophies: [
        {
          concept: "Explicit boundaries",
          description: "Keep decisions inspectable.",
          source_type: "code" as const,
        },
      ],
      technical_tradeoffs: [
        { topic: "Local execution", decision: "Run locally", rationale: "Limit data movement." },
      ],
      development_methods: [{ method_name: "Fixture-first" }],
      media_references: [],
    };
    expect(EngineeringProfileSourceSchema.parse(source)).toEqual(source);
    expect(() =>
      EngineeringProfileSourceSchema.parse({
        ...source,
        engineering_philosophies: [{ concept: "", description: "missing concept" }],
      }),
    ).toThrow();
    expect(() => EngineeringProfileSourceSchema.parse({ ...source, unexpected: true })).toThrow();
  });

  it("requires explicit release limitations and review status", () => {
    expect(
      ReleaseMetadataSchema.parse({
        packageId: "lmp:mind:example",
        version: "1.0.0",
        changelog: ["Initial community archetype release."],
        limitations: ["Not an endorsement by a named organization."],
        review: {
          status: "unreviewed",
          reviewers: [],
          notes: "Independent review has not yet been completed.",
        },
      }),
    ).toMatchObject({ review: { status: "unreviewed" } });
  });

  it("requires complete rule contracts for every enforcement decision", () => {
    const rule = {
      id: "complexity.cyclomatic",
      policyFile: "rules/complexity.json",
      severity: "error" as const,
      classification: "verifiable" as const,
      rationale: "Keep control flow reviewable.",
      assertion: "Measured complexity stays below the ceiling.",
      scope: ["source functions"],
      remediation: "Split the function and rerun evaluation.",
      limitations: ["Does not assess domain correctness."],
      evidence: { classification: "verified-fixture" as const, sourceId: "evidence.json" },
    };
    expect(RuleContractManifestSchema.parse({ schemaVersion: "1.0", rules: [rule] })).toEqual({
      schemaVersion: "1.0",
      rules: [rule],
    });
    expect(() =>
      RuleContractManifestSchema.parse({
        schemaVersion: "1.0",
        rules: [{ ...rule, scope: [] }],
      }),
    ).toThrow(/scope/);
  });

  it("does not promote inferred or unsupported evidence into hard rules", () => {
    const rule = {
      id: "style.inferred",
      policyFile: "rules/style.json",
      severity: "warning" as const,
      classification: "judgment-guided" as const,
      rationale: "A hypothesis needs review before enforcement.",
      assertion: "The implementation follows the proposed style.",
      scope: ["source"],
      remediation: "Review the evidence and update the profile.",
      limitations: ["The source does not establish a universal rule."],
      evidence: { classification: "inferred-hypothesis" as const, sourceId: "source-1" },
    };
    expect(() =>
      RuleContractManifestSchema.parse({
        schemaVersion: "1.0",
        rules: [{ ...rule, severity: "error" }],
      }),
    ).toThrow(/inferred hypothesis/);
    expect(() =>
      RuleContractManifestSchema.parse({
        schemaVersion: "1.0",
        rules: [{ ...rule, classification: "verifiable" }],
      }),
    ).toThrow(/inferred hypothesis/);
    expect(() =>
      RuleContractManifestSchema.parse({
        schemaVersion: "1.0",
        rules: [{ ...rule, evidence: { classification: "unsupported", sourceId: "source-1" } }],
      }),
    ).toThrow(/unsupported evidence/);
    expect(() => RuleContractSchema.parse(rule)).toThrow(/proposal-only/);
  });

  it("rejects a canonical package that impersonates verified authorship", () => {
    const canonical = {
      $schema: "https://lendingmind.org/schemas/mind.json",
      specVersion: "1.0",
      id: "lmp:mind:example",
      version: "1.0.0",
      modeDefaults: { validation: "advisory" as const, network: "offline" as const },
      author: {
        kind: "community-archetype",
        displayName: "Official Team",
        verified: true,
        website: null,
      },
      provenance: { sources: [], attributionRequired: true },
      philosophy: { principles: [], tradeoffs: [], decisionRules: [], antiPatterns: [] },
      capabilities: { languages: [], requiredAgentTools: [] },
      enforcement: {},
    };
    expect(() => CanonicalMindPackageSchema.parse(canonical)).toThrow(
      /verified authorship requires the official-maintainer author kind/,
    );
  });
});
