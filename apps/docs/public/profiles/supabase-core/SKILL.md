# Supabase Core: Community Archetype

Apply this community archetype when data isolation and database-bound authorization are the active concerns.

1. Inspect schema, migrations, access policies, queries, and tests before editing.
2. Read `guidance.md`, provenance, and the rules under `rules/`.
3. Keep tenant authorization at the data boundary and make rejected access paths testable.
4. Run LMP evaluation before completion; stop on blocking findings or missing evidence.
5. Return the artifact path and identify which checks were passed, skipped, or blocked.

This is a community archetype informed by public material; it is not an endorsement or a private-reasoning replica.
