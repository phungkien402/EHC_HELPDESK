"""
Retriever — embeds the rewritten query with bge-m3 and fetches Top-K
most similar chunks from Qdrant.

Uses the SAME embedding model as data/embedder.py — mismatched models
will silently produce poor results.

Run standalone: python -m core.retriever
"""

from core.models import RetrievedChunk


def retrieve(query: str, top_k: int = 10) -> list[RetrievedChunk]:
    """
    Embed the query and search Qdrant for the top_k most similar chunks.
    Returns a list of RetrievedChunk with raw cosine similarity scores.
    """
    ...


if __name__ == "__main__":
    results = retrieve("How do I merge duplicate patient records in EHC?")
    print(f"[RETRIEVER] Retrieved {len(results)} chunks")
    for i, r in enumerate(results, 1):
        print(f"  #{i}  score={r.score:.3f} | {r.text[:60]}...")
