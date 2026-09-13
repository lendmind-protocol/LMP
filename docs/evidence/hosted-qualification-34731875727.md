# Hosted qualification record: 34731875727

This record captures the hosted benchmark gate for revision
`ec4ab1d5e87da9acbbbe88a17c4c1905f76a8496`.

| Field | Result |
| --- | --- |
| Workflow | [Lending-Mind Protocol Benchmark Gate](https://github.com/lendmind-protocol/LMP/actions/runs/34731875727) |
| Revision | `ec4ab1d5e87da9acbbbe88a17c4c1905f76a8496` |
| Artifact | v2.0, repository clean, TypeScript profile digest recorded |
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

This is evidence that the bounded study protocol executed reproducibly for the
recorded inputs. It is not evidence that LMP improves every model's output,
that the supplied candidates came from a live model host, or that LMP is a
substitute for review, CI, static analysis, or security testing.
