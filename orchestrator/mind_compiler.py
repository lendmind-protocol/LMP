#!/usr/bin/env python3
"""Stable command surface for deterministic Mind proposal compilation.

The semantic compiler is implemented in :mod:`mind_crawler` so discovery and
compilation share one normalization path.  This entry point exists to make
the compiler independently discoverable for operators and automation without
creating a second profile interpretation engine.

It accepts the same arguments as ``mind_crawler.py``.  Public network
discovery remains explicit, proposal output remains draft-only, and no
profile is promoted, signed, or activated by this command.
"""

from __future__ import annotations

try:
    from .mind_crawler import main as _compile
except ImportError:  # direct ``python3 orchestrator/mind_compiler.py`` use
    from mind_crawler import main as _compile


def main(argv: list[str] | None = None) -> int:
    """Compile a reviewable proposal through the canonical harvester engine."""
    return _compile(argv)


if __name__ == "__main__":
    raise SystemExit(main())
