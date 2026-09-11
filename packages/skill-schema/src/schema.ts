import { z } from "zod";

export const RuleDefinitionSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    severity: z.enum(["info", "warning", "error"]).optional(),
  })
  .passthrough();

export const RuleClassificationSchema = z.enum([
  "deterministic",
  "verifiable",
  "judgment-guided",
  "human-only",
]);

export const RuleContractSchema = z
  .object({
    id: z.string().min(1),
    policyFile: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    classification: RuleClassificationSchema,
    rationale: z.string().min(1),
    assertion: z.string().min(1),
    scope: z.array(z.string().min(1)).min(1),
    remediation: z.string().min(1),
    limitations: z.array(z.string().min(1)).min(1),
    evidence: z
      .object({
        classification: z.enum([
          "explicit-statement",
          "repeated-code-pattern",
          "review-pattern",
          "inferred-hypothesis",
          "unsupported",
          "verified-fixture",
        ]),
        sourceId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const RuleContractManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    rules: z.array(RuleContractSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const rule of value.rules) {
      if (ids.has(rule.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules"],
          message: `duplicate rule contract id: ${rule.id}`,
        });
      ids.add(rule.id);
    }
  });

export const RuleResultSchema = z
  .object({
    ruleId: z.string().min(1),
    passed: z.boolean(),
    message: z.string().optional(),
    rationale: z.string().min(1).optional(),
    severity: z.enum(["info", "warning", "error"]).optional(),
    evidence: z.unknown().optional(),
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    remediation: z.string().optional(),
    limitations: z.array(z.string()).optional(),
  })
  .strict();

export const EvidenceFixtureSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["positive", "negative", "exception"]),
    description: z.string().min(1),
    expected: z.enum(["pass", "needs_revision", "blocked"]),
  })
  .strict();

export const EvidenceManifestSchema = z
  .object({
    status: z.literal("verified-fixtures"),
    tests: z.array(EvidenceFixtureSchema).min(3),
    notes: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const fixture of value.tests) {
      if (ids.has(fixture.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tests"],
          message: `duplicate evidence fixture id: ${fixture.id}`,
        });
      ids.add(fixture.id);
    }
    for (const kind of ["positive", "negative", "exception"] as const)
      if (!value.tests.some((fixture) => fixture.kind === kind))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tests"],
          message: `at least one ${kind} fixture is required`,
        });
  });

export const ReleaseMetadataSchema = z
  .object({
    packageId: z.string().min(1),
    version: z.string().min(1),
    changelog: z.array(z.string().min(1)).min(1),
    limitations: z.array(z.string().min(1)).min(1),
    review: z
      .object({
        status: z.enum([
          "unreviewed",
          "community-reviewed",
          "maintainer-reviewed",
          "externally-reviewed",
        ]),
        reviewers: z.array(
          z
            .object({
              name: z.string().min(1),
              role: z.string().min(1),
              evidence: z.string().min(1),
            })
            .strict(),
        ),
        notes: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const SkippedCheckSchema = z
  .object({ checkId: z.string().min(1), reason: z.string().min(1) })
  .strict();

export const MindPackageSchema = z
  .object({
    $schema: z.string().url().optional(),
    specVersion: z.string().optional(),
    id: z.string().min(1),
    version: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    rules: z.array(RuleDefinitionSchema).optional(),
    modeDefaults: z
      .object({
        validation: z.enum(["advisory", "enforced", "audit"]),
        network: z.literal("offline"),
      })
      .optional(),
    author: z
      .object({
        kind: z.string(),
        displayName: z.string(),
        verified: z.boolean(),
        website: z.string().url().nullable(),
      })
      .optional(),
    provenance: z
      .object({
        sources: z.array(
          z.object({
            title: z.string(),
            url: z.string().url(),
            licenseNote: z.string(),
            evidenceTier: z.enum(["primary", "secondary", "derived"]),
            rights: z.enum(["public-documentation", "author-provided", "licensed", "unknown"]),
            sourceType: z.enum([
              "documentation",
              "repository",
              "blog",
              "talk",
              "review",
              "derived",
            ]),
            accessMethod: z.enum(["public-http", "author-provided", "local-repository"]),
            contentDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
            retentionPolicy: z.string().min(1),
            allowedUse: z.string().min(1),
          }),
        ),
        attributionRequired: z.boolean(),
      })
      .optional(),
    philosophy: z
      .object({
        principles: z.array(z.string()),
        tradeoffs: z.array(z.string()),
        decisionRules: z.array(z.string()),
        antiPatterns: z.array(z.string()),
      })
      .optional(),
    capabilities: z
      .object({ languages: z.array(z.string()), requiredAgentTools: z.array(z.string()) })
      .optional(),
    enforcement: z.record(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

const SemanticVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    "version must use semantic versioning (x.y.z)",
  );

export const CanonicalMindPackageSchema = MindPackageSchema.superRefine((value, ctx) => {
  if (!value.$schema) return;
  const required: Array<[keyof typeof value, string]> = [
    ["specVersion", "specVersion"],
    ["modeDefaults", "modeDefaults"],
    ["author", "author"],
    ["provenance", "provenance"],
    ["philosophy", "philosophy"],
    ["capabilities", "capabilities"],
    ["enforcement", "enforcement"],
  ];
  for (const [key, label] of required)
    if (value[key] === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${label} is required for canonical mind packages`,
      });
  if (value.specVersion && value.specVersion !== "1.0")
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["specVersion"],
      message: "specVersion must be 1.0",
    });
  const version = SemanticVersionSchema.safeParse(value.version);
  if (!version.success)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["version"],
      message: "canonical mind package versions must use semantic versioning (x.y.z)",
    });
  if (value.author?.kind === "community-archetype" && value.author.verified)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["author", "verified"],
      message: "community archetypes are not verified authorship",
    });
  if (!/^lmp:mind:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id))
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["id"],
      message: "canonical mind package IDs must use the lmp:mind:<kebab-case> form",
    });
  if (value.author?.verified && value.author.kind !== "official-maintainer")
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["author", "kind"],
      message: "verified authorship requires the official-maintainer author kind",
    });
});

export const EvaluationArtifactSchema = z
  .object({
    artifactVersion: z.string().min(1),
    runId: z.string().min(1),
    createdAt: z.string().datetime(),
    workspace: z
      .object({
        pathHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        gitHead: z.string().nullable(),
        dirty: z.boolean(),
        scope: z
          .object({
            changedOnly: z.boolean(),
            source: z.string(),
            checkedFiles: z.number().int().nonnegative(),
            fallbackReason: z.string().nullable().optional(),
          })
          .optional(),
      })
      .strict(),
    mind: z
      .object({
        id: z.string().min(1),
        version: z.string().min(1),
        contentDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        signatureStatus: z.enum(["unsigned", "verified", "invalid"]),
        layers: z.array(z.unknown()).optional(),
      })
      .strict(),
    mode: z.enum(["advisory", "enforced", "audit"]),
    state: z.enum(["pass", "needs_revision", "blocked", "evaluation_error"]),
    summary: z
      .object({
        status: z.enum(["pass", "warning", "fail", "blocked", "error"]),
        score: z.number().optional(),
        hardViolationCount: z.number().int().nonnegative(),
        warningCount: z.number().int().nonnegative(),
        informationalCount: z.number().int().nonnegative(),
      })
      .strict(),
    checks: z.array(z.unknown()),
    skippedChecks: z.array(SkippedCheckSchema),
    analysis: z
      .object({
        languages: z.array(z.string()),
        parsers: z.array(z.string()),
        versions: z.array(z.string()),
        checkedFiles: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    loopTransitions: z.array(z.unknown()),
    commands: z.array(z.unknown()),
    limitations: z.array(z.string()),
    environment: z.record(z.unknown()),
    privacy: z
      .object({
        sourceCodeIncluded: z.boolean(),
        rawPathsIncluded: z.boolean(),
        networkUsed: z.boolean(),
      })
      .strict(),
    artifactPath: z.string().optional(),
  })
  .strict();

export const PromotionProposalSchema = z
  .object({
    proposalId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.string().min(1),
    selectedArtifacts: z.array(z.string().min(1)).min(1),
    candidateChanges: z.array(z.unknown()),
    rationale: z.string().min(1),
    expectedBenefit: z.string().min(1),
    falsePositiveRisk: z.string().min(1),
    requiredVersionBump: z.enum(["patch", "minor", "major"]),
    requiredTests: z.array(z.string()),
    benchmarkPlan: z.array(z.string()),
    approver: z.string().nullable(),
    status: z.enum(["draft", "under-review", "accepted", "rejected", "superseded"]),
    createdAt: z.string().datetime(),
    decisionReason: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const requiresDecision = ["accepted", "rejected", "superseded"].includes(value.status);
    if (requiresDecision && !value.approver?.trim())
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approver"],
        message: `${value.status} proposals require an approver`,
      });
    if (requiresDecision && !value.decisionReason?.trim())
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decisionReason"],
        message: `${value.status} proposals require a decision reason`,
      });
    if (["draft", "under-review"].includes(value.status) && value.approver !== null)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approver"],
        message: `${value.status} proposals cannot have an approver before a decision`,
      });
  });

export const RegistryReferenceSchema = z
  .object({
    registry: z.string().url(),
    packageId: z.string().min(1),
    version: z.string().min(1),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  })
  .strict();

export const PromotionRecordSchema = z
  .object({
    packageId: z.string().min(1),
    version: z.string().min(1),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    from: z.string().min(1),
    to: z.string().min(1),
    promotedAt: z.string().datetime(),
    promotedBy: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

export const mindPackageJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "MindPackage",
  type: "object",
  required: [
    "$schema",
    "specVersion",
    "id",
    "name",
    "version",
    "description",
    "modeDefaults",
    "author",
    "provenance",
    "philosophy",
    "capabilities",
    "enforcement",
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    version: { type: "string", minLength: 1 },
    name: { type: "string" },
    description: { type: "string" },
    rules: {
      type: "array",
      items: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", minLength: 1 } },
        additionalProperties: true,
      },
    },
    metadata: { type: "object", additionalProperties: true },
  },
  additionalProperties: true,
} as const;

export function exportJsonSchema(): typeof mindPackageJsonSchema {
  return mindPackageJsonSchema;
}

export const toJsonSchema = exportJsonSchema;
