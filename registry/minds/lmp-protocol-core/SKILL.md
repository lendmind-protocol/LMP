# Linux Kernel Defensive Systems: Community Archetype

Apply this community archetype when low-level ownership, allocation, and complexity are central concerns.

1. Inspect ownership, lifetimes, error paths, tests, and build configuration before editing.
2. Read `guidance.md`, provenance, and the rules under `rules/`.
3. Keep policy separate from mechanism, make resource ownership explicit, and keep complexity within the declared budget.
4. Run LMP evaluation before completion; fix blocking findings or document an approved exception.
5. Return the artifact path, profile identity, and all skipped or unavailable checks.

This is a community archetype informed by public engineering guidance; it is not a Linux Kernel project endorsement.
