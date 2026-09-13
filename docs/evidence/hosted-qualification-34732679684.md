# Hosted qualification record: 34732679684

This record captures the hosted benchmark gate for revision
`56976a77c68b03d4640c2a32ea121e1cc74eb4b7`.

| Field | Result |
| --- | --- |
| Workflow | [Lending-Mind Protocol Benchmark Gate](https://github.com/lendmind-protocol/LMP/actions/runs/34732679684) |
| Revision | `56976a77c68b03d4640c2a32ea121e1cc74eb4b7` |
| Artifact | v2.0, clean repository, TypeScript profile digest recorded |
| Study design | 3 repeated trials × 64 isolated OSS scenarios = 192 paired trials |
| Verified provenance | 15/15 sources |
| LMP transitions | 192/192 passed |
| Docker gates | 384/384 passed |
| Ordinary compiler-control checks | 384/384 passed |
| Baseline evaluator pass rate | 0/192 (0.0%) |
| Guided evaluator pass rate | 192/192 (100.0%) |
| Candidate provenance | Explicitly supplied, digest-bound fixture inputs |
| Causal claim | Not established |

The run also passed workspace lint, tests, typecheck, Rust workspace tests and
release build, onboarding integration, sandbox construction, qualification,
technical artifact validation, signed static sync, and the test bed.

This proves that the bounded study protocol executed reproducibly for the
recorded inputs. It does not prove universal model improvement, live-model
generation, independent review, or production adoption.
