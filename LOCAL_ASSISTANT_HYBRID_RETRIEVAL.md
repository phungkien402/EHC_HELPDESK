# LOCAL ASSISTANT — Phase 2: Hybrid Retrieval (BM25 + Vector)

_Branch: LOCAL_ASSISTANT_

## Goal

Replace pure vector retrieval with hybrid BM25 + vector retrieval using
Reciprocal Rank Fusion (RRF). Current retriever is vector-only — keyword-heavy
queries like exact menu names or error messages are better served by BM25.

Approach: BM25 index built in-memory from Qdrant at startup. No collection
recreation needed, no re-embedding required.

## Project path

```
/home/phungkien/EHC_HELPDESK
```

---

## Step 0 — Read source files before making any changes

Use `mcp__code-review-graph` to read each file listed below in full before
touching anything. Do not rely on memory or assume file structure — read first.

Files to read:
- `core/retriever.py`
- `core/models.py`
- `config.py`
- `requirements.txt`

---

## Step 1 — Install dependency

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && pip install rank-bm25 --break-system-packages"
```

Add `rank-bm25` to `requirements.txt`.

---

## Change 1 — Create `core/bm25_index.py`

Create new file:

```python
"""
BM25 index built in-memory from Qdrant collection at startup.
Used alongside vector retrieval for hybrid search.

Loads all chunk_text from Qdrant once, builds a BM25Okapi index.
Stays in memory — rebuilds on service restart (acceptable for ~500-5000 docs).
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from rank_bm25 import BM25Okapi
from qdrant_client import QdrantClient

from config import QDRANT_URL, QDRANT_COLLECTION


def _tokenize(text: str) -> list[str]:
    """
    Simple Vietnamese tokenizer — split on whitespace and punctuation.
    Vietnamese is space-separated so this works well for BM25.
    Lowercases and removes punctuation.
    """
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    return text.split()


class BM25Index:
    """
    In-memory BM25 index over all Qdrant documents.
    Call build() once at startup, then search() at query time.
    """

    def __init__(self):
        self._bm25: BM25Okapi | None = None
        self._doc_ids: list[int] = []       # issue_id for each doc
        self._doc_payloads: dict[int, dict] = {}  # issue_id → payload

    def build(self, client: QdrantClient) -> None:
        """
        Scroll all documents from Qdrant and build BM25 index.
        Uses chunk_text field (raw display text, not embedding_text).
        """
        print(f"[BM25] Building index from Qdrant collection: {QDRANT_COLLECTION}")

        all_docs = []
        offset = None

        while True:
            results, offset = client.scroll(
                collection_name=QDRANT_COLLECTION,
                limit=100,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            if not results:
                break

            for point in results:
                issue_id = point.payload.get("issue_id", point.id)
                chunk_text = point.payload.get("chunk_text", "")
                self._doc_ids.append(issue_id)
                self._doc_payloads[issue_id] = point.payload
                all_docs.append(_tokenize(chunk_text))

            if offset is None:
                break

        self._bm25 = BM25Okapi(all_docs)
        print(f"[BM25] Index built: {len(self._doc_ids)} documents")

    def search(self, query: str, top_k: int) -> list[tuple[int, float, dict]]:
        """
        Search BM25 index.
        Returns list of (issue_id, bm25_score, payload) sorted by score descending.
        """
        if self._bm25 is None:
            return []

        tokens = _tokenize(query)
        scores = self._bm25.get_scores(tokens)

        # Pair scores with doc_ids, sort descending
        scored = sorted(
            zip(self._doc_ids, scores),
            key=lambda x: x[1],
            reverse=True,
        )[:top_k]

        return [
            (issue_id, score, self._doc_payloads[issue_id])
            for issue_id, score in scored
            if score > 0  # skip zero-score results
        ]


# Module-level singleton — built lazily on first use
_index: BM25Index | None = None


def get_bm25_index(client: QdrantClient) -> BM25Index:
    """Return the module-level BM25 index, building it on first call."""
    global _index
    if _index is None:
        _index = BM25Index()
        _index.build(client)
    return _index


if __name__ == "__main__":
    from qdrant_client import QdrantClient
    client = QdrantClient(url=QDRANT_URL)
    idx = BM25Index()
    idx.build(client)

    test_queries = [
        "in bảng kê khám bệnh",
        "kê đơn thuốc không được",
        "quét thẻ BHYT không tìm thấy bệnh nhân",
    ]
    for q in test_queries:
        print(f"\nQuery: {q}")
        results = idx.search(q, top_k=3)
        for issue_id, score, payload in results:
            print(f"  score={score:.3f} | {payload.get('subject', '')}")
```

---

## Change 2 — Update `core/retriever.py`

### 2a. Add imports at top of file

After existing imports, add:

```python
from core.bm25_index import get_bm25_index
```

### 2b. Add RRF fusion helper function

Add this function before the `retrieve()` function:

```python
def _rrf_fusion(
    vector_results: list,
    bm25_results: list[tuple[int, float, dict]],
    top_k: int,
    k: int = 60,
) -> list[RetrievedChunk]:
    """
    Reciprocal Rank Fusion — combines vector and BM25 ranked lists.

    RRF score = sum of 1/(k + rank) across all result lists.
    k=60 is the standard constant (Robertson et al., 2009).

    vector_results: Qdrant ScoredPoint list (already ranked by vector score)
    bm25_results:   list of (issue_id, bm25_score, payload) sorted by BM25 score
    """
    rrf_scores: dict[int, float] = {}
    payloads: dict[int, dict] = {}

    # Vector ranks (1-indexed)
    for rank, point in enumerate(vector_results, start=1):
        issue_id = point.payload.get("issue_id", point.id)
        rrf_scores[issue_id] = rrf_scores.get(issue_id, 0) + 1 / (k + rank)
        payloads[issue_id] = point.payload

    # BM25 ranks (1-indexed)
    for rank, (issue_id, _score, payload) in enumerate(bm25_results, start=1):
        rrf_scores[issue_id] = rrf_scores.get(issue_id, 0) + 1 / (k + rank)
        if issue_id not in payloads:
            payloads[issue_id] = payload

    # Sort by RRF score descending
    sorted_ids = sorted(rrf_scores, key=lambda x: rrf_scores[x], reverse=True)[:top_k]

    chunks = []
    for issue_id in sorted_ids:
        payload = payloads[issue_id]
        chunks.append(RetrievedChunk(
            text=payload.get("chunk_text", ""),
            score=rrf_scores[issue_id],
            metadata={
                "issue_id": payload.get("issue_id"),
                "subject": payload.get("subject"),
                "description": payload.get("description"),
                "project": payload.get("project"),
                "url": payload.get("url"),
            },
        ))

    return chunks
```

### 2c. Update `retrieve()` — add hybrid search

Replace the existing `retrieve()` function body with:

```python
def retrieve(query: str, top_k: int = None) -> list[RetrievedChunk]:
    """
    Hybrid retrieval: BM25 + vector search fused with RRF.
    Returns top_k chunks ranked by combined relevance.
    """
    if top_k is None:
        top_k = RETRIEVER_TOP_K

    fetch_k = top_k * 2  # fetch more from each source before fusion

    print(f"[RETRIEVER] Query: \"{query}\"")

    # --- Vector search ---
    query_vector = _model.encode(query).tolist()
    vector_results = _client.search(
        collection_name=QDRANT_COLLECTION,
        query_vector=query_vector,
        limit=fetch_k,
    )

    # --- BM25 search ---
    bm25_idx = get_bm25_index(_client)
    bm25_results = bm25_idx.search(query, top_k=fetch_k)

    print(f"[RETRIEVER] Vector: {len(vector_results)} results | BM25: {len(bm25_results)} results")

    # --- RRF fusion ---
    chunks = _rrf_fusion(vector_results, bm25_results, top_k=top_k)

    print(f"[RETRIEVER] Top {len(chunks)} chunks (hybrid):")
    for i, c in enumerate(chunks, 1):
        print(f"  #{i} rrf={c.score:.4f} | {c.metadata['subject']}")

    return chunks
```

---

## Verify

### Syntax check

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m py_compile core/bm25_index.py core/retriever.py && echo OK"
```

### Test BM25 index standalone

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m core.bm25_index"
```

### Test hybrid retriever

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m core.retriever"
```

Expected: log shows both `Vector: N results | BM25: M results` then fused ranking.

### Restart and test via bot

```bash
sudo systemctl restart ehc-helpdesk
```

Test queries — check if ranking improves vs before:
```
"in bảng kê BHYT"           ← exact keyword match, BM25 should boost
"kê đơn thuốc bị lỗi"       ← keyword: "lỗi", "kê đơn"
"Ctrl+F tìm dịch vụ"        ← exact phrase, BM25 wins here
```

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git add core/bm25_index.py core/retriever.py requirements.txt && git commit -m 'feat: hybrid retrieval — BM25 + vector with RRF fusion' && git push origin LOCAL_ASSISTANT"
```
