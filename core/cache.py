"""
In-memory LRU caches for rewrite, retrieval, and final answers.

All caches use a normalized query key (lowercase, stripped, collapsed whitespace)
so minor variations ("BHYT" vs "bhyt", double-space) map to the same entry.
"""

import time
import unicodedata
from collections import OrderedDict
from typing import Any


def _normalize(text: str) -> str:
    """Normalize a query string to a stable cache key."""
    text = text.lower().strip()
    text = " ".join(text.split())                  # collapse whitespace
    text = unicodedata.normalize("NFC", text)      # Unicode compose
    return text


class LRUCache:
    """
    Thread-safe LRU cache with optional TTL (seconds).
    TTL=0 means no expiry.
    """

    def __init__(self, maxsize: int = 512, ttl: int = 0):
        self._maxsize = maxsize
        self._ttl = ttl
        self._store: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        import threading
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        nkey = _normalize(key)
        with self._lock:
            if nkey not in self._store:
                return None
            value, ts = self._store[nkey]
            if self._ttl and (time.time() - ts) > self._ttl:
                del self._store[nkey]
                return None
            # Move to end (most recently used)
            self._store.move_to_end(nkey)
            return value

    def set(self, key: str, value: Any) -> None:
        nkey = _normalize(key)
        with self._lock:
            if nkey in self._store:
                self._store.move_to_end(nkey)
            self._store[nkey] = (value, time.time())
            if len(self._store) > self._maxsize:
                self._store.popitem(last=False)   # evict LRU

    def invalidate(self, key: str) -> None:
        nkey = _normalize(key)
        with self._lock:
            self._store.pop(nkey, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def __len__(self) -> int:
        return len(self._store)

    def stats(self) -> dict:
        return {"size": len(self._store), "maxsize": self._maxsize, "ttl": self._ttl}


# ---------------------------------------------------------------------------
# Module-level singleton caches
# ---------------------------------------------------------------------------

# Rewrite cache: raw_query → rewritten_query string
# No TTL — rewrites are deterministic and stable
rewrite_cache: LRUCache = LRUCache(maxsize=1024, ttl=0)

# Retrieval cache: rewritten_query → list[Chunk]
# No TTL — retrieval results change only when KB is re-indexed
retrieval_cache: LRUCache = LRUCache(maxsize=512, ttl=0)

# Answer cache: rewritten_query → Answer
# TTL = 3600s — answers can go stale if KB is updated
answer_cache: LRUCache = LRUCache(maxsize=256, ttl=3600)
