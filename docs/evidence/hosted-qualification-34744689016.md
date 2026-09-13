# Hosted benchmark qualification — run 34744689016

This record is bound to commit
[`eb2c519ada108c50cab81a2c112fe42192da3970`](https://github.com/lendmind-protocol/LMP/commit/eb2c519ada108c50cab81a2c112fe42192da3970)
and the [successful hosted workflow run](https://github.com/lendmind-protocol/LMP/actions/runs/34744689016).

## Result

| Measure | Result |
|---|---:|
| Workflow | `success` |
| Qualification scenarios | `39/39` |
| Repository scenarios | `64/64` |
| Repeated trials | `3` |
| Paired transitions | `192/192` |
| Docker gates | `384/384` |
| Ordinary compiler controls | `384/384` |
| Verified provenance sources | `15/15` |
| Baseline evaluator pass rate | `0%` |
| Guided evaluator pass rate | `100%` |
| Technical evidence contract | `verified` |
| Repository revision | `eb2c519ada108c50cab81a2c112fe42192da3970` |
| Uploaded evidence artifact | [lmp-benchmark-evidence](https://github.com/lendmind-protocol/LMP/actions/runs/34744689016/artifacts/10313599953) |

The matrix used eight public repositories, eight bounded task scenarios, and
three repeated candidate-input trials. Each candidate was evaluated in an
isolated workspace, and the Docker checks verified the selected candidate files
were mounted under the configured restrictions.

## What this proves

It proves that this revision reproduced the configured baseline-to-guided
transition under the recorded candidate inputs, with the configured evaluator,
compiler controls, provenance checks, and Docker qualification passing on the
hosted runner.

## What this does not prove

The run does not establish causal improvement for arbitrary AI-generated code,
universal host interception, private model behavior, production safety, or
independent human-review agreement. The default run uses explicit candidate
inputs; it is not evidence of a live model unless an operator supplies the
`--agent-command` lane. Independent reviewer annotations were not supplied.
