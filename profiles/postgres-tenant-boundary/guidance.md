# Postgres Tenant Boundary

This community archetype turns tenant-isolation documentation into bounded,
reviewable static signals. It does not prove runtime isolation, RLS behavior,
or the correctness of a migration.

Before completion, inspect the migration and `docs/security/tenant-isolation.md`,
record explicit single-tenant exceptions with an owner and expiry, and review
all warnings with a database-aware human reviewer.
