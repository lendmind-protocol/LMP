export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface RuleDefinition {
  id: string;
  description?: string;
  severity?: "info" | "warning" | "error";
  [key: string]: JsonValue | undefined;
}

export interface MindPackage {
  $schema?: string;
  specVersion?: string;
  id: string;
  version: string;
  name?: string;
  description?: string;
  rules?: RuleDefinition[];
  modeDefaults?: { validation: "advisory" | "enforced" | "audit"; network: "offline" };
  author?: { kind: string; displayName: string; verified: boolean; website: string | null };
  provenance?: {
    sources: {
      title: string;
      url: string;
      licenseNote: string;
      evidenceTier: "primary" | "secondary" | "derived";
      rights: "public-documentation" | "author-provided" | "licensed" | "unknown";
      sourceType: "documentation" | "repository" | "blog" | "talk" | "review" | "derived";
      accessMethod: "public-http" | "author-provided" | "local-repository";
      contentDigest: string;
      retentionPolicy: string;
      allowedUse: string;
    }[];
    attributionRequired: boolean;
  };
  philosophy?: {
    principles: string[];
    tradeoffs: string[];
    decisionRules: string[];
    antiPatterns: string[];
  };
  capabilities?: { languages: string[]; requiredAgentTools: string[] };
  enforcement?: Record<string, string>;
  metadata?: Record<string, JsonValue>;
  [key: string]: JsonValue | RuleDefinition[] | undefined;
}

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  message?: string;
  rationale?: string;
  severity?: "info" | "warning" | "error";
  evidence?: JsonValue;
  file?: string;
  line?: number;
  column?: number;
  remediation?: string;
  limitations?: string[];
  sourceId?: string;
  sourceClaim?: string;
  sourceLocator?: string;
  implementation?: string;
  fixture?: string;
}

export type EvaluationState = "pass" | "needs_revision" | "blocked" | "evaluation_error";

export interface EvaluationSummary {
  status: "pass" | "warning" | "fail" | "blocked" | "error";
  score?: number;
  hardViolationCount: number;
  warningCount: number;
  informationalCount?: number;
}

export interface EvaluationArtifact {
  id: string;
  packageId: string;
  packageVersion: string;
  digest: string;
  createdAt: string;
  results: RuleResult[];
  metadata?: Record<string, JsonValue>;
  mode?: "advisory" | "enforced" | "audit";
  summary?: Record<string, JsonValue>;
  state?: EvaluationState;
  limitations?: string[];
  artifactPath?: string;
  profile?: {
    id: string;
    version: string;
    digest: string;
    signatureStatus: "unsigned" | "present" | "verified" | "invalid";
  };
}

export interface RegistryReference {
  registry: string;
  packageId: string;
  version: string;
  digest: string;
}

export interface PromotionRecord {
  packageId: string;
  version: string;
  digest: string;
  from: string;
  to: string;
  promotedAt: string;
  promotedBy?: string;
  reason?: string;
}

export interface PromotionProposal {
  proposalId: string;
  profileId: string;
  profileVersion: string;
  selectedArtifacts: string[];
  candidateChanges: JsonValue[];
  rationale: string;
  expectedBenefit: string;
  falsePositiveRisk: string;
  requiredVersionBump: "patch" | "minor" | "major";
  requiredTests: string[];
  benchmarkPlan: string[];
  approver: string | null;
  status: "draft" | "under-review" | "accepted" | "rejected" | "superseded";
  createdAt: string;
  decisionReason?: string;
}

export type RegistryEntry = RegistryReference;
export type Promotion = PromotionRecord;
