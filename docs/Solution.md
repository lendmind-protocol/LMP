# Lending-Mind Solution

## Problem

AI coding agents can produce plausible code quickly, but teams still need to verify whether the change matches repository conventions, architecture, security boundaries, dependency policy, test expectations, and operational constraints.

Existing tools each solve part of the problem:

- `AGENTS.md` and Cursor rules provide instructions.
- Agent Skills provide reusable workflows.
- MCP provides tool and context access.
- TypeScript, Biome, ESLint, Semgrep, CodeQL, tests, and CI provide checks.
- Human reviewers provide judgment.

The gap is coordination. Instructions do not prove compliance. Linters do not know the profile's methodology. CI often reports after generation. Agents may produce code that passes superficial checks while violating repository-specific expectations.

## Solution

Lending-Mind Protocol is a runtime methodology and verification system for AI-built software.

A versioned engineering profile is compiled into:

- Task-scoped agent guidance.
- Typed context.
- Tool authorization.
- Evaluation plan.
- Bounded remediation loop.
- Evidence artifact.
- Pull-request summary.
- Human-reviewed profile proposal.

The central invariant is:

```text
One profile → guidance + verification + evidence
```

LMP does not replace existing tools. It synchronizes them around a versioned engineering methodology.

## What LMP adds

### 1. Methodology as a versioned artifact

A profile can include:

- Principles.
- Trade-offs.
- Decision rules.
- Preferred patterns.
- Anti-patterns.
- Repository conventions.
- Source provenance.
- Exceptions.
- Fixtures.
- Version history.
- Optional signatures.

This makes “what good looks like” explicit and reviewable.

### 2. Agent-facing guidance

LMP compiles a profile into a task-specific instruction bundle. It includes non-negotiable requirements, relevant trade-offs, repository constraints, and a visible completion checklist.

### 3. Typed context

LMP separates:

- Hard constraints.
- Repository facts.
- Task contract.
- Methodology guidance.
- Findings.
- Historical artifacts.
- Exceptions.

This avoids flattening mandatory rules into optional prose.

### 4. Harness boundaries

LMP defines what the agent may do:

- Read and search.
- Write within workspace boundaries.
- Run approved commands.
- Use network only when explicitly enabled.
- Avoid package installation, deployment, push, and upload unless approved.

### 5. Deterministic and existing-tool evaluation

LMP coordinates:

- TypeScript compiler.
- Biome and ESLint.
- Test commands.
- Dependency policy.
- Semgrep or CodeQL when configured.
- OPA/Rego when an organization uses it.
- Existing Rust AST validation.
- Optional Docker sandbox.

Missing tools are reported as skipped checks, not silently installed.

### 6. Bounded remediation loop

The agent receives structured findings and can correct objective failures before human review.

```text
Generate
  → evaluate
  → explain
  → remediate
  → re-evaluate
  → attest or escalate
```

The loop stops on repeated findings, test regression, security errors, unauthorized actions, exhausted retries, or human-only decisions.

### 7. Evidence artifact

Every evaluation writes a local redacted artifact containing:

- Profile identity and version.
- Findings and remediation.
- Checks and skipped checks.
- Command results.
- Loop transitions.
- Privacy metadata.
- Explicit limitations.

A PR summary can be generated from the artifact.

## Comparison with existing approaches

| Capability | AGENTS.md / rules | Agent Skills | MCP | Linters / tests / CI | LMP |
|---|---:|---:|---:|---:|---:|
| Human-readable guidance | Yes | Yes | No | No | Yes |
| Portable workflow | Partial | Yes | No | No | Yes |
| Tool/context access | No | Partial | Yes | No | Yes |
| Deterministic checks | No | Script-dependent | No | Yes | Yes |
| Profile methodology | Manual prose | Manual prose | No | No | Yes |
| Typed context | No | No | No | No | Yes |
| Tool authorization | No | Partial metadata | Host-dependent | No | Yes |
| Bounded remediation loop | No | No | No | No | Yes |
| Evidence artifact | No | No | No | CI logs only | Yes |
| Profile provenance | No | Partial | No | No | Yes |
| Human-reviewed evolution | Git edits | Git edits | No | Config changes | Yes |

## Example: dependency and input validation

### Generic AI-generated code

```ts
import axios from "axios";

export async function fetchUserProfile(userId: string): Promise<any> {
  try {
    const response = await axios.get(`${INTERNAL_API_URL}/users/${userId}`);
    console.log("Fetched user profile", response.data);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch user", error);
    return null;
  }
}
```

Potential issues:

- Adds a dependency without rationale.
- Uses explicit `any`.
- Does not encode the user ID.
- Does not validate the upstream payload.
- Logs response data.
- Collapses different error states into `null`.

### LMP-guided AI code

```ts
import { request } from "undici";
import { userProfileSchema } from "../schemas/user-profile.js";
import { UpstreamServiceError, UserNotFoundError } from "../errors/index.js";

export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  const url = new URL(`/users/${encodeURIComponent(userId)}`, INTERNAL_API_URL);
  const response = await request(url);

  if (response.statusCode === 404) {
    throw new UserNotFoundError(userId);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new UpstreamServiceError("user-api", response.statusCode);
  }

  return userProfileSchema.parse(await response.body.json());
}
```

LMP contribution:

- Profile guidance selects existing approved tooling.
- Dependency policy checks the package manifest.
- TypeScript policy checks explicit `any`.
- Repository context reuses existing schema and error modules.
- Test and typecheck commands are run only when authorized.
- Artifact records what passed, failed, or was skipped.

This does not prove the code is universally correct. It proves that the selected profile's checks were applied and evidence was recorded.

## Example: tenant boundary

### Generic AI-generated code

```ts
export async function getDocument(userId: string, documentId: string) {
  const organizationId = await getOrganizationId(userId);
  const document = await db.document.findFirst({
    where: {
      id: documentId,
      organizationId,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  return document;
}
```

This query includes an organization filter, but the safety property exists only in this function. A future query path may omit it.

### LMP-guided AI code

```ts
export async function getDocument(documentId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, created_at")
    .eq("id", documentId)
    .single();

  if (error) {
    throw mapDatabaseError(error);
  }

  return data;
}
```

Assumed profile policy:

- Tenant-scoped tables require declared database isolation policy.
- Application code must not manually accept an organization ID for this read path.
- Migration and documentation signals are evaluated.
- Static results are labeled as signals, not proof of complete security.

LMP contribution:

- Profile guidance directs the agent toward the declared authorization boundary.
- Evaluator checks migration and documentation signals.
- Artifact records limitations and skipped checks.
- Human review remains responsible for security judgment.

## What LMP does not solve

LMP does not:

- Guarantee code quality.
- Guarantee security.
- Replace human review.
- Replace tests, CI, linters, SAST, or threat modeling.
- Reproduce a person 1:1.
- Train base-model weights.
- Prove architecture or runtime behavior from static analysis alone.
- Make a signed profile correct or safe.

## Success condition

LMP succeeds when it catches meaningful repository-specific issues before human review, with lower setup burden and lower noise than the team's existing combination of instructions, linters, policy tools, test runners, and CI.

The project must prove this through reproducible fixtures, real repository evaluation, benchmark methodology, false-positive measurement, and review feedback—not through architecture language alone.
