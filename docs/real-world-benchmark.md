# Real-World Benchmark Gate

`orchestrator/real_world_benchmark.py` emits a version `2.0` paired study
artifact. It uses eight pinned public OSS repositories and eight task classes
(64 scenario families), with three repeated trials by default. Every trial
uses the same explicitly injected or model-produced baseline/guided input
pair; candidate bytes are digest-bound in the input manifest and each artifact
record retains its input provenance.

The runner evaluates both candidates with the LMP evaluator, records the local
TypeScript compiler control, and executes allowlisted repository `lint`,
`test`, `typecheck`, and `check` scripts only inside a networkless,
read-only Docker container. Command exit status, timing, and output digests
are retained; command output and source text are not included in evidence.

The default explicit fixture is suitable for exercising the harness contract,
not for a model-quality claim. Supply `--candidate-inputs` with a manifest
whose producer is either `explicit-injection` or `model`. Model manifests must
identify provider, model, and a digest of the generation request.

Generate a model-backed manifest with the provider-neutral adapter:

```bash
python3 orchestrator/model_candidate_generator.py \
  --command 'your-model-host-command' \
  --provider your-provider \
  --model your-model-id \
  --host your-host-id \
  --trials 3 \
  --output lmp-test-results/model-candidates.json
```

The host command receives one JSON request on standard input and must return
JSON containing `implementation`, `test`, and `package`. The adapter records
the request digest, model identity, host identity, paired condition, and
candidate-byte digest. It rejects incomplete or invalid responses.

The artifact gate requires repeated paired trials, complete measurable outcomes,
verified source URLs and content digests, clean provenance, and the explicit
claim status `causalClaim: not-established`. It therefore cannot be used to
claim causal quality improvement without a separately pre-registered model/
host protocol and independent review evidence.

## Provenance

`registry/provenance/real-sources.json` identifies the publisher, source type,
URL, and claim for every cited source. The runner fetches each source and stores
only status, byte count, and SHA-256 content digest in the evidence artifact.
Reachability and content identity do not establish author endorsement.
