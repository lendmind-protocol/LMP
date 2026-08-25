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
    sources: { title: string; url: string; licenseNote: string }[];
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
  severity?: "info" | "warning" | "error";
  evidence?: JsonValue;
}

export interface EvaluationArtifact {
  id: string;
  packageId: string;
  packageVersion: string;
  digest: string;
  createdAt: string;
  results: RuleResult[];
  metadata?: Record<string, JsonValue>;
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

export type RegistryEntry = RegistryReference;
export type Promotion = PromotionRecord;
