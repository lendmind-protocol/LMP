import { z } from "zod";

export const RuleDefinitionSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    severity: z.enum(["info", "warning", "error"]).optional(),
  })
  .passthrough();

export const RuleResultSchema = z
  .object({
    ruleId: z.string().min(1),
    passed: z.boolean(),
    message: z.string().optional(),
    severity: z.enum(["info", "warning", "error"]).optional(),
    evidence: z.unknown().optional(),
  })
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
          z.object({ title: z.string(), url: z.string().url(), licenseNote: z.string() }),
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
  if (value.author?.kind === "community-archetype" && value.author.verified)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["author", "verified"],
      message: "community archetypes are not verified authorship",
    });
});

export const EvaluationArtifactSchema = z
  .object({
    id: z.string().min(1),
    packageId: z.string().min(1),
    packageVersion: z.string().min(1),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    createdAt: z.string().datetime(),
    results: z.array(RuleResultSchema),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

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
