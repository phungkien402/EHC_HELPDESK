"""
Retriever — embeds the rewritten query with bge-m3 and fetches Top-K
most similar chunks from Qdrant.

Uses the SAME embedding model as data/embedder.py — mismatched models
will silently produce poor results.

Run standalone: python -m core.retriever
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient

from config import QDRANT_URL, QDRANT_COLLECTION, EMBED_MODEL, EMBED_DEVICE, RETRIEVER_TOP_K
from core.models import RetrievedChunk
from core.bm25_index import get_bm25_index

# Module-level singletons — loaded once when module is first imported
print(f"[RETRIEVER] Loading {EMBED_MODEL} on {EMBED_DEVICE} ...")
_model = SentenceTransformer(EMBED_MODEL, device=EMBED_DEVICE)
print(f"[RETRIEVER] Embed model ready.")
_client = QdrantClient(url=QDRANT_URL)


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


if __name__ == "__main__":
    test_queries = [
        "in bảng kê khám bệnh ở đâu",
        "cách gộp hồ sơ bệnh nhân trùng",
        "xem tồn kho thuốc",
    ]
    for q in test_queries:
        print(f"\n{'='*60}")
        results = retrieve(q, top_k=5)
        print()
