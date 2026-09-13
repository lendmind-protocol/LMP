> [!WARNING]
> This is a legacy explanatory draft. It mixes current implementation details
> with aspirational examples and must not be used as a product capability
> contract. For the current behavior, read the [canonical overview](../apps/docs/content/docs/concepts/overview.mdx),
> [capability inventory](../apps/docs/content/docs/operations/capability-inventory.mdx),
> and [release status](../apps/docs/content/docs/operations/roadmap.mdx).

This legacy draft uses deliberately sharp rhetoric. In practice, AI coding agents can produce plausible changes while missing repository-specific constraints; the degree varies by model, task, tooling, and review process.

If you ask a default AI agent to build a simple web page or an API, it will pull in 50 heavy dependencies, write massive nested loops, and create a codebase that is hard to maintain. It does this because it is just mimicking the average code found on the internet. It does not know why a veteran engineer would choose a lightweight tool instead of a heavy framework. It lacks "battle scars."

**Lending-Mind** addresses part of this gap by packaging a declared engineering stance as guidance, executable checks, and reviewable evidence. It can constrain supported changes at a connected evaluation boundary; it does not control an agent's private reasoning.

> **Status note:** Rust is the canonical LMP runtime. TypeScript references describe secondary Node.js integration and target-project tooling, not a second LMP implementation.

## Is It Practical?
Think of a default AI agent like a highly skilled rental car driver. They know how to steer, gas, and brake perfectly (that is what Claude Code or Codex does natively).

But if you put that driver on a dangerous, icy mountain road, they are going to crash because they don't have the experience of a local mountain driver.

- A traditional prompt or markdown file is like shouting out the window: "_Hey, please be careful on the ice!_" The driver may hear you, but there is no independent record that the rule was followed.

- **Lending-Mind** is more like carrying documented route guidance and placing checks at the road boundaries. The driver still chooses how to drive; a connected evaluator can reject a change when a declared, implemented rule is violated.

When you use **LMP**, the selected Mind makes its trade-offs discoverable and returns concrete findings. An agent may use that feedback to change `package.json`, `Cargo.toml`, or implementation code, but LMP does not autonomously rewrite source or guarantee that the agent follows every recommendation.

> By creating a system that records source-backed philosophy, trade-offs, and design choices alongside executable checks, LMP makes review claims more inspectable. It does not prove that a generated patch has achieved human-level craftsmanship.

## If those skills already exist as raw configurations, why should you build Lending-Mind Protocol (LMP)? Why not just use them out of the box?
open-source community's initial hype from reality. In the current ecosystem, skills like `ponytail`, `caveman`, or `emil-kowalski-design` are blowing up on GitHub because they are fantastic _instruction lists_.

**The short answer is**: Skills are primarily guidance assets. LMP adds a versioned package, integrity checks, and bounded evaluation at connected protocol, daemon, or Git boundaries. It does not make a skill universally active or prevent every host-level bypass.

# The Reality of Modern AI Skills
The practical limitation of the traditional skill model is **non-invocation**: a host or model may not load guidance when it is needed.

- When you install a skill like `ponytail` or `caveman` by dropping a .md file into an agent's directory, the AI model has to choose to read it and obey it.
- Under pressure, an agent can overlook guidance. LMP records the active package and can evaluate supported source and policy boundaries, but it cannot inspect private model attention or guarantee that every host invokes the guidance.
- If an agent writes outside a connected LMP boundary, that write is outside LMP's enforcement scope. Git hooks, daemon watching, and MCP checks provide distinct, documented boundaries rather than a universal filesystem firewall.

### Do not think of LMP project as a duplicate of `ponytail`.
- `ponytail` is a specific profile asset. It tells the AI: "_Be a lazy senior developer, write less code, use native standard libraries._"
- **LMP is the engine format**. It doesn't matter if the community is using `ponytail`, `caveman`, or `supabase-core`. LMP provides the **unified registry format, cryptographic package integrity, the local terminal daemon, and the sandbox metrics recorder** that turns a supported skill into a signed, reviewable policy package with bounded local enforcement where the declared rule is supported. It does not make an agent infallible or prove that a policy is universally correct.

- **Questions**: And How do we Force the AI Use this is there we need to setup or touching like the AI Agents Artifacts control system (config.toml, etc) and how the Agent know the LMP is newly existing in their system like if a greenfield or brownfield user install this AI doesn't have idea what this, so is like when they install this the agent start action it first all needed (e,g. installs, configuration, etc)?

- to use the Lending-Mind Protocol (LMP), we don't need to rebuild or fork an agent. Instead, onboarding writes the supported project-scoped guidance and adapter files for the selected host. Hosts differ in what they read and how they invoke tools; LMP does not assume that every agent consumes every file. Supported integrations are documented for **Claude Code**, **Roo Code / Cline**, **Cursor**, and **Claude Desktop**, with missing or unavailable adapters reported explicitly.
> The question targets the exact moment of installation: if a user opens a brand-new project (**greenfield**) or an established system repository (**brownfield**), how does the agent discover LMP, and how does the agent instantly bootstrap its own configurations?

The protocol accomplishes this via a two-part workspace contract: **discoverable guidance** and **MCP/tool-backed evidence enforcement**.

- When a user runs `npx create-lmp`, the bootstrapper checks the environment. Whether the environment is a greenfield or brownfield project, it adds an explicit, marked LMP section to workspace guidance without overwriting existing instructions. It writes the local adapter contract and, when available, uses a checksum-verified Rust sidecar. The evaluator then enforces the selected policy on the declared scope before that result can be treated as passing.

### The Lifecycle Stream: What Happens Post-Install
``[Agent Initialized] ──► [1. Reads CLAUDE.md/AGENTS.md] ──► [2. Host invokes configured LMP MCP adapter] ──► [3. Candidate evaluated at the connected boundary]``
The LMP MCP adapter receives the host request and keeps a persistent Rust session for the request lifecycle. The Rust side validates the workspace scope, loads the selected local Mind package, and returns typed guidance, findings, remediation state, or an explicit blocked/error result. It does not silently clone dependencies or pretend that an unavailable host integration was installed.

By setting up the protocol this way, the workspace contract remains portable across agent vendors. LMP uses their **file-reading habits** to make the active policy discoverable, and their **MCP capabilities** to pass requests to the local Rust validation rules. The host still needs to consume `.lmp_telemetry/agent-mcp.json`; onboarding does not silently edit global agent settings, and a missing adapter is reported rather than treated as enforcement.

To understand what success can look like under the Lending-Mind Protocol (LMP), compare objective code and review evidence. When an agent operates under declared constraints, the resulting patch may change in architecture, complexity, and measured checks. The three side-by-side examples below are illustrative comparisons across different stacks—not universal outcomes or proof that LMP transforms every patch into production-grade software.

---

## 🎨 1. Frontend UI Components

* **Target Profile:** `lmp:mind:shadcn-minimalism`
* **Rule:** Use copy-and-paste primitives. Do not install heavy NPM packages for simple components. Use utility-first styles (Tailwind).

<table>
<tr>
<th>❌ Traditional AI Code (Internet-Average)</th>
<th>✅ Example that satisfies the shown checks</th>
</tr>
<tr>
<td>

```typescript
import React from 'react';
import { DatePicker } from 'heavy-calendar-suite'; 
import _ from 'lodash';

export function UserProfileCard({ user }) {
  const formattedDate = _.get(user, 'meta.createdAt') 
    ? new Date(_.get(user, 'meta.createdAt'))
        .toLocaleDateString() 
    : 'N/A';
    
  return (
    <div 
      className="card-wrapper" 
      style={{ padding: 20, borderRadius: 8 }}
    >
      <h3>{user.name}</h3>
      <DatePicker selected={formattedDate} readOnly />
    </div>
  );
}
```

* **Issue:** Installs a huge 2.4MB external library just to show a date.
* **Issue:** Uses `lodash` for simple object reading.
* **Issue:** Uses messy inline JavaScript styles.

</td>
<td>

```typescript
import * as React from "react";
import { cn } from "@/lib/utils"; 

interface ProfileCardProps 
  extends React.HTMLAttributes<HTMLDivElement> {
  user: { name: string; createdAt: string };
}

export const UserProfileCard = React.forwardRef<
  HTMLDivElement, ProfileCardProps
>(({ className, user, ...props }, ref) => {
  const formattedDate = user.createdAt 
    ? new Date(user.createdAt).toLocaleDateString() 
    : "N/A";

  return (
    <div 
      ref={ref} 
      className={cn("rounded-lg border p-4 shadow-sm", className)} 
      {...props}
    >
      <h3 className="font-semibold">{user.name}</h3>
      <time 
        className="text-sm text-muted-foreground" 
        dateTime={user.createdAt}
      >
        Joined: {formattedDate}
      </time>
    </div>
  );
});
UserProfileCard.displayName = "UserProfileCard";
```

* **Observed check:** A dependency policy can report the heavy library in `package.json`.
* **Example remediation:** The author rewrites object lookups into native JavaScript syntax.
* **Example remediation:** The author uses utility styles and access-friendly HTML tags (`<time>`).

</td>
</tr>
</table>

---

## 🗄️ 2. Backend Databases & Security

* **Target Profile:** `lmp:mind:supabase-postgres`
* **Rule:** Do not filter tenant data in the application layer. Force security on the database engine.

<table>
<tr>
<th>❌ Traditional AI Code (Internet-Average)</th>
<th>✅ Example that satisfies the shown checks</th>
</tr>
<tr>
<td>

```javascript
// App-layer query pulling all records into memory
const { data: records, error } = await supabase
  .from('billing_ledgers')
  .select('*');

// Dangerous application-layer loop filtering 
const cleanData = records.filter(row => 
  row.organization_id === currentUser.org_id
);

return cleanData;
```

* **Issue:** Downloads the entire raw database table into the application memory.
* **Issue:** Risks data leaks if a developer forgets to apply the array filter in a new file.

</td>
<td>

```sql
-- Forced Database Engine Security Migration Layer
ALTER TABLE billing_ledgers 
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_isolation_policy 
  ON billing_ledgers
  FOR ALL
  TO authenticated
  USING (
    organization_id = (
      auth.jwt() ->> 'user_metadata'
    )::jsonb ->> 'org_id'
  );
```

* **Fix:** The Rust parser flags the bad data join (`APP_LAYER_JOIN`) and rejects the code.
* **Fix:** Forces the agent to secure data using native PostgreSQL Row Level Security (RLS).

</td>
</tr>
</table>

---

## ⚙️ 3. High-Throughput Server Code

* **Target Profile:** `lmp:mind:go-core-thompson`
* **Rule:** Keep code simple. Avoid deep nesting and complex helper classes.

<table>
<tr>
<th>❌ Traditional AI Code (Internet-Average)</th>
<th>✅ LMP Enforced Code (Professional)</th>
</tr>
<tr>
<td>

```go
func HandleMetricsDownload(w http.ResponseWriter, r *http.Request) {
    // Dangerous implicit crash recovery abstraction
    defer func() { recover() }() 
    
    manager := DIContainer.GetMetricService().GetWrapper()
    data := manager.Process(r.URL.Query().Get("id"))
    
    json.NewEncoder(w).Encode(data)
}
```

* **Issue:** Over-engineers a simple server endpoint with heavy dependencies.
* **Issue:** Uses a generic recovery tool to hide potential code crashes.

</td>
<td>

```go
func HandleMetricsDownload(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "missing id", http.StatusBadRequest)
        return
    }

    data, err := fetchNativeMetrics(r.Context(), id)
    if err != nil {
        http.Error(w, "system failure", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(data)
}
```

* **Observed check:** A configured complexity rule can report the over-budget implementation.
* **Example remediation:** The author adds explicit error handling and a narrower boundary.

</td>
</tr>
</table>

---

## 📊 4. Structural Metric Comparison Matrix

<table>
  <tr>
    <th>Quality Metric Category</th>
    <th>Traditional AI Code Expectation</th>
    <th>Lending-Mind Protocol (LMP) Execution Result</th>
    <th>System Enforcement Mechanism</th>
  </tr>
  <tr>
    <td><b>Dependency Weight</b></td>
    <td>Uncontrolled code package bloat.</td>
    <td><b>Minimalist</b>; limited strictly to approved atomic tools.</td>
    <td>Automated <code>package.json / Cargo.toml</code> Sanitizer</td>
  </tr>
  <tr>
    <td><b>Logic Complexity Budget</b></td>
    <td>Deep nesting paths that make maintenance difficult.</td>
    <td><b>Strictly Capped</b>; functions stay small and single-purpose.</td>
    <td>Rust Compiler-Grade AST Parser (<code>syn</code> sidecar)</td>
  </tr>
  <tr>
    <td><b>Security Integration</b></td>
    <td>Lazy; filtering data inside basic code arrays.</td>
    <td><b>Deeply Bound</b>; uses native system security models.</td>
    <td>Axiomatic Static Context Guardrails</td>
  </tr>
  <tr>
    <td><b>Hardware Run Profile</b></td>
    <td>Unpredictable; heavy memory spikes.</td>
    <td><b>Optimized</b>; verified sub-15ms cold start speeds.</td>
    <td>Isolated Docker Telemetry Sandbox Kernel</td>
  </tr>
</table>

# Development Status

- Level 1: Style (**current state MVP**)
<p>Naming, formatting, dependency preference.</p>

```
Mind selection
  ↓
Context alignment
  ↓
```
- Level 2: Rules (Next Milestone)
<p>AST checks, complexity, required tests, banned patterns.</p>

```
Plan shaped by Mind
  ↓
Tool use shaped by Mind
  ↓
```
- Level 3: Methodology (Future Hardening Delivery)
<p>Architecture boundaries, decision trees, trade-offs, review logic.</p>

```
Code generated under Mind
  ↓
Static / dynamic / semantic evaluation
  ↓
```
- Level 4: Behavioral loop (Future Hardening Delivery)
<p>Agent planning, tool usage, validation sequence, remediation.</p>

```
Deviation detected
  ↓
```
- Level 5: Evidence memory (Future Hardening Delivery)
<p>Artifacts, successful patterns, failures, exceptions, reviewer outcomes.</p>

```
Critique and remediation
  ↓
```

- Level 6: High-fidelity Mind (The Main Vision)
<p>Verified author or organization contributes source material, reviews behavior, signs releases, and continuously calibrates the Mind.</p>

```
Artifact stored
  ↓
Mind calibration proposal
```

<p>An executable engineering evidence layer for AI-assisted development. LMP Minds package documented engineering stances: philosophy, trade-offs, architectural boundaries, implementation archetypes, tool behavior, review standards, and verified outcomes.

The LMP runtime makes that Mind available through guidance, validation, artifacts, and optional agent integrations. It detects deviations only for declared checks within the evaluated scope, returns findings for remediation, and uses verified artifacts to inform future human-reviewed Mind proposals.</p>

## Current verified boundary

The local Rust evaluator, signed package checks, Docker qualification suite, MCP adapter tests, public vault validator, and self-hosting run are implemented and exercised in [`docs/evidence`](./evidence/). LMP does not guarantee private reasoning, universal language coverage, universal host enforcement, authorship, or production readiness. OCI/IPFS adapters are tested against controlled endpoints; all four current production packages have gateway-verified IPFS pins, while OCI publication and independent release evidence remain blocked by their separate gates.
