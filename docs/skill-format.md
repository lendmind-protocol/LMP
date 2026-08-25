# Mind Package format

A package contains `mind.json`, `guidance.md`, four rule files under `rules/`,
optional test fixtures, `evidence/README.md`, and signature metadata. The
manifest records `specVersion`, stable `id`, semantic `version`, mode defaults,
generic/verified authorship, provenance, philosophy, capabilities, and paths to
enforceable policies.

Guidance expresses principles, trade-offs, preferred practices, anti-patterns,
and decision rules. Rule JSON expresses thresholds, dependency policies,
TypeScript checks, and explicitly allowlisted commands. Philosophy does not
silently become an enforcement rule.

Use semantic versioning. A signature covers canonical sorted package files and
never private keys, artifacts, executable behavior, or generated output. New
authors must include source attribution; person-specific packages require
verified opt-in and must not impersonate anyone.
