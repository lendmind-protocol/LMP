# Zero-config profile source prompt

Use this prompt with a public source, pasted notes, or an explicitly supplied
repository summary. Return JSON only. Do not invent quotations, URLs, authorship,
or technical decisions. If the source does not support a field, use an empty
array or omit the optional field.

```text
Extract a reviewable engineering profile source from the material below.

Rules:
1. Separate observed statements from your interpretation.
2. Keep descriptions concise and attributable to the supplied material.
3. Record a source_type only when the material's origin is known.
4. Record tradeoff rationale only when the source explains it.
5. Include media references only for supplied, valid URLs. Never create links.
6. Return exactly the JSON shape defined by:
   registry/schemas/engineering-profile-source.schema.json
7. This is evidence for human review, not an executable policy and not proof of
   the named person's or project's endorsement.

Material:
<PASTE_SOURCE_OR_NOTES_HERE>
```

Example:

```json
{
  "engineering_philosophies": [
    {
      "concept": "Prefer explicit boundaries",
      "description": "Keep policy, evaluation, and artifact handling separate so each decision can be inspected.",
      "source_type": "code"
    }
  ],
  "technical_tradeoffs": [
    {
      "topic": "Local evaluation versus remote execution",
      "decision": "Evaluate locally by default",
      "rationale": "Local execution limits data movement and makes the selected scope visible."
    }
  ],
  "development_methods": [
    {
      "method_name": "Fixture-first verification",
      "application": "Keep positive, negative, and exception examples beside the profile."
    }
  ],
  "media_references": []
}
```

The output must be validated before it is attached to a Mind proposal. It does
not bypass provenance, source digests, contradiction review, fixtures, signing,
or registry promotion gates.
