# Internal Demo Matrix

This is the executable proof corresponding to `.internal/prove-demo.pdf` and
`.internal/use-cases-demo.pdf`. It is separate from the technical qualification
suite because it proves the Mind-level decision workflow on real OSS revisions.

## Run

```bash
cargo build --release --workspace --target-dir /tmp/lmp-internal-demo-target
python3 orchestrator/internal_demo.py \
  --lmp /tmp/lmp-internal-demo-target/release/lmp \
  --output /path/to/lmp-internal-oss-matrix
```

The runner uses isolated shallow clones of the required real repositories and
records their exact commit revisions. It creates two candidates for the same
task shape:

1. A baseline candidate with known quality regressions.
2. A Mind-guided candidate using typed, explicit, native behavior.

The run is successful only when every repository transitions from
`needs_revision` to `pass` under enforced evaluation.

## Required repository matrix

| Repository | Demonstrated concern |
| --- | --- |
| `t3-oss/create-t3-app` | Product/TypeScript workflow and minimal dependency choice |
| `supabase/supabase` | Production monorepo boundary and scoped change workflow |
| `openai/codex-security` | Security-oriented evidence and explicit execution behavior |

## Evidence requirements

Each result records the upstream URL, full revision, task, selected and
rejected options, Mind digest, baseline outcome, guided outcome, rule IDs,
checked-file count, and privacy metadata. The artifact excludes source code and
raw workspace paths.

The demonstration proves the observed decision-and-enforcement loop for the
pinned revisions. It does not claim that static evaluation replaces human
architecture review, that one Mind is universally superior, or that a
controlled candidate is an unobserved model's private reasoning.
