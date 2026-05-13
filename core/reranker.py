"""
Reranker — uses a cross-encoder model (bge-reranker-v2-m3) to rescore
retrieved chunks by reading each (question, chunk) pair directly.

This is the primary fix for "chaotic" outputs — vector similarity alone
returns loosely related chunks; the reranker produces much more accurate
relevance scores.

Run standalone: python -m core.reranker
"""

from core.models import RetrievedChunk


def rerank(query: str, chunks: list[RetrievedChunk], top_n: int = 3) -> list[RetrievedChunk]:
    """
    Rescore chunks using the cross-encoder reranker.
    Returns the top_n chunks sorted by reranker score (descending).
    """
    ...


if __name__ == "__main__":
    # Test with dummy chunks
    dummy_chunks = [
        RetrievedChunk(text="Merge patient records: Go to Administration module...", score=0.82, metadata={}),
        RetrievedChunk(text="Delete duplicate patient: Go to patient list...", score=0.71, metadata={}),
        RetrievedChunk(text="Search patient: Enter name or ID...", score=0.65, metadata={}),
    ]
    results = rerank("How do I merge duplicate patient records?", dummy_chunks)
    print(f"[RERANKER] Input: {len(dummy_chunks)} chunks")
    print(f"[RERANKER] After reranking (top {len(results)}):")
    for i, r in enumerate(results, 1):
        print(f"  #{i}  score={r.score:.3f} | {r.text[:60]}...")
