# Real-World Benchmark Gate

`orchestrator/real_world_benchmark.py` is the executable benchmark for the
real-world claim. It runs eight pinned public OSS repositories across eight
different task classes, producing 64 isolated baseline/guided scenarios. Each
scenario also runs a conservative ordinary-controls lane: the local
TypeScript compiler is executed against both candidates, while repository-owned
lint, test, and CI commands are discovered and recorded but never executed.

Repositories:

- Express
- Hono
- create-t3-app
- Supabase
- codex-security
- Microsoft TypeScript
- Swagger UI
- Cal.com

Task classes:

- API behavior
- dependency choice
- input validation
- security boundary
- regression testing
- performance judgment
- CLI workflow
- architecture/refactoring

Each scenario records the upstream URL, exact commit, task class, cited source
reference, baseline result, guided result, ordinary compiler-control result,
rule IDs, and privacy metadata. The
benchmark is successful only when every baseline is rejected and every guided
candidate passes in changed-only enforced evaluation.

## Provenance

`registry/provenance/real-sources.json` identifies the publisher, source type,
URL, and claim for every cited source. The runner fetches each source and stores
only status, byte count, and SHA-256 content digest in the evidence artifact. It
does not copy source text into the repository or claim author endorsement.

This verifies that the cited material is reachable and materially identifiable;
it does not prove that a source author approved the Mind or that one Mind is
universally correct.
