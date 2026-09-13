# Hosted benchmark qualification — run 34737607974

This record is bound to commit
[`752fe3a3f64214f9f9054f4063fdaffa6529d0fe`](https://github.com/lendmind-protocol/LMP/commit/752fe3a3f64214f9f9054f4063fdaffa6529d0fe)
and the [hosted workflow run](https://github.com/lendmind-protocol/LMP/actions/runs/34737607974).

## Result

| Measure | Result |
|---|---:|
| Workflow | `success` |
| Repository scenarios | `64/64` |
| Repeated trials | `3` |
| Paired transitions | `192/192` |
| Docker gates | `384/384` |
| Ordinary TypeScript compiler controls | `384/384` |
| Verified provenance sources | `15/15` |
| Baseline evaluator pass rate | `0%` |
| Guided evaluator pass rate | `100%` |

The matrix used eight public repositories, eight bounded task scenarios, and
three repeated candidate-input trials. Each candidate was evaluated in an
isolated workspace, and the Docker check verified the selected candidate files
were mounted.

## What this proves

It proves that this revision can reproduce the configured baseline-to-guided
transition under the recorded fixture inputs, with the configured evaluator,
compiler control, provenance sources, and Docker gate passing on the hosted
runner.

## What this does not prove

The run does not establish causal improvement for arbitrary AI-generated code,
universal host interception, private model behavior, production safety, or
independent human-review agreement. The default run uses explicit candidate
inputs; it is not evidence of a live model unless an operator supplies the
`--agent-command` lane. Independent reviewer annotations were not supplied.
