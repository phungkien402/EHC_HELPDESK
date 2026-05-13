"""
Reindex — Drop and rebuild the entire Qdrant collection, or incrementally
update only issues modified since the last run.

Usage:
  python -m data.reindex           # full rebuild
  python -m data.reindex --diff    # incremental update (uses .last_index_time)
"""

import sys


def full_reindex() -> None:
    """Drop collection and rebuild from scratch."""
    ...


def diff_reindex() -> None:
    """Only update issues modified since last successful run."""
    ...


if __name__ == "__main__":
    if "--diff" in sys.argv:
        diff_reindex()
    else:
        full_reindex()
