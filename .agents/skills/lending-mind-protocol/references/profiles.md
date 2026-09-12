# LMP Profile Selection

Select by the repository’s dominant risk and constraints, not by the person or
brand in a profile name. Verify the installed manifest and rules before use.

| Profile | Best fit | Review carefully |
| --- | --- | --- |
| `baseline` | General projects and first evaluation | It is a conservative default, not a complete security review |
| `tj-ponytail` | TypeScript/Node work where dependency and abstraction restraint matter | It can reject intentional abstractions; document exceptions |
| `supabase-core` | SQL/Postgres and data-isolation work | Application-layer authorization and tenancy still need tests |
| `linux-kernel` | Defensive systems programming and low-complexity changes | It is not a C compiler or a Linux-kernel correctness proof |
| `tj-holowaychuk-minimalism` | Minimal TypeScript/Node style review | Style alignment is not a substitute for behavior and security checks |

Profile states have different meanings:

- **Installed locally**: available in the local package or registry.
- **Validated**: package contract and signature checks passed locally.
- **Active**: selected in the workspace configuration.
- **Evaluated**: a run produced evidence for a stated scope.
- **Published**: externally available from a real immutable registry or release;
  this must never be inferred from local validation.

When no profile fits, use `baseline`, report the mismatch, and propose a
versioned custom Mind through the package and review workflow.
