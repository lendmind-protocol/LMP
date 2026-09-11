# Mind harvesting and contradiction mapping

`orchestrator/mind_compiler.py` is the stable compiler entry point. It turns
explicitly supplied public evidence into a reviewable LMP profile proposal by
delegating to the canonical `orchestrator/mind_crawler.py` engine. The crawler
can also fetch bounded public RSS/Atom
feeds, public YouTube timed-text transcripts, and public GitHub API summaries
when those sources are explicitly named.
It is an evidence compiler, not a blind web scraper and not an automatic
authorship or endorsement system.

## Evidence layers

The input manifest separates three kinds of observable evidence:

- `textual`: public blogs, documentation, talks, and method descriptions.
- `implementation`: an explicitly supplied public repository observation or a
  local repository inspected without executing its code.
- `critique`: public reviews, rejected proposals, post-mortems, or other
  material that records an explicit preference or exception.

For discovery, use `--rss` for a public feed, `--youtube-video` for a public
video with an available timed-text transcript, `--github-repo` for a public
`github.com/<owner>/<repo>` URL, or `--github-profile` for a public user or
organization. Profile discovery is bounded to the ten highest-starred public
repositories; each repository contributes at most 10 commits and 20 closed
issues/PRs. It also reads the public language summary, up to eight root
dependency manifests (`package.json`, `Cargo.toml`, `go.mod`,
`requirements.txt`, `requirements-dev.txt`, or `pyproject.toml`), and at most
24 source files within a 250 KB aggregate budget. Source inspection records
language-neutral declaration counts, file/content digests, and inspected-byte
budgets; it does not retain source text or claim compiler-grade AST analysis.
The result records dependency names, language choices, the repository revision,
and an explicit `codeExecuted: false` observation. It records bounded
aggregates and links, not repository checkouts, imports, installs, or arbitrary
code execution.

Every source gets a stable content digest, rights and allowed-use metadata, a
source type, and a reference. The output retains metadata and digests only;
raw source text, private paths, credentials, and private reasoning are never
written to the artifact.

## Deterministic compilation

The compiler uses a small, reviewable lexicon to cluster repeated observations
such as dependency minimalism, performance budgets, security boundaries,
complexity control, testing, and immutability. It does not infer a numeric
limit from a general statement. Numeric candidates are emitted only when an
input source contains an explicit bound such as `cyclomatic complexity <= 5`.

One source is insufficient evidence for promotion. A candidate needs at least
two independent supporting source records, and all candidates remain
`promotionEligible: false` until a maintainer reviews the evidence, adds
fixtures and benchmarks, and signs the resulting package.

When a cluster has both supporting and rejecting evidence, the compiler emits a
`human-review-required` contradiction. It does not choose a preferred side and
does not silently convert the conflict into an enforcement rule.

Each candidate also carries an explicit evidence classification:
`explicit-statement` for a source-stated numeric bound,
`repeated-code-pattern` for implementation observations, `review-pattern` for
critique evidence, and `inferred-hypothesis` when multiple evidence kinds must
be interpreted together. Sources that produce no recognized signal remain in
`unsupportedSources` with the `unsupported` classification; they are not
silently discarded or promoted.

## Local example

```bash
python3 orchestrator/mind_compiler.py \
  --entity example-style \
  --input orchestrator/fixtures/mind-harvester/contradictory-footprint.json \
  --output lmp-test-results/mind-harvester/example-style.json
```

An explicit public discovery run looks like this:

```bash
python3 orchestrator/mind_compiler.py \
  --entity public-style \
  --rss https://example.org/engineering/feed.xml \
  --github-profile https://github.com/example \
  --youtube-video 'https://www.youtube.com/watch?v=abc1234' \
  --output lmp-test-results/mind-harvester/public-style.json
```

The command is offline by default. Public HTTPS fetching is opt-in with
`--fetch`; local source records require `--allow-local`. Repository inspection
is bounded and never runs repository commands, installs dependencies, or
executes source code.

The result is a draft proposal. It is not a signed mind package, does not
modify `registry/definitions`, and cannot activate a profile. Use the existing
proposal review, fixture, benchmark, signature, and registry gates before any
promotion.

## Explicit boundaries

The harvester does not claim to reconstruct a person's private reasoning,
access restricted material, determine authorship, or prove that a public source
endorses LMP. YouTube retrieval is opt-in and only works when a public
timed-text transcript is available; it does not bypass access controls or
retain transcript text. Long-lived archives remain outside this tool and must
supply their own rights, rate, credential, and provenance controls before they
can be added.
