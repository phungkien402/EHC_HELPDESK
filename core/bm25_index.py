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
