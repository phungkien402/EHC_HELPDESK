"""
Embedder — Takes a list of Documents, embeds them with bge-m3, stores in Qdrant.

Each chunk is stored with payload: {issue_id, subject, description, project, url, chunk_text}
Embedding dimension: 1024 (bge-m3 output size)
Uses upsert so re-running is always safe (no duplicates).

Run standalone: python -m data.embedder
"""

from data.ingestor import Document


def build_chunk_text(doc: Document) -> str:
    """
    Combine subject + description into the text to embed.
    Subject carries most semantic meaning since descriptions are very short.
    """
    return f"Câu hỏi: {doc.subject}\nHướng dẫn: {doc.description}"


def embed_and_store(docs: list[Document]) -> int:
    """
    Embed all documents and upsert into Qdrant.
    Returns the number of chunks stored.
    """
    ...


if __name__ == "__main__":
    from data.ingestor import fetch_all_documents

    docs = fetch_all_documents()
    count = embed_and_store(docs)
    print(f"Stored {count} chunks in Qdrant")
