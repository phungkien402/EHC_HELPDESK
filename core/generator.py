"""
Generator — calls vLLM via its OpenAI-compatible API to produce a grounded
answer from the rewritten question and top reranked chunks.

The system prompt strictly instructs the LLM to answer ONLY from the provided
context — no hallucination allowed.

Run standalone: python -m core.generator
"""

from core.models import RetrievedChunk


def generate(query: str, chunks: list[RetrievedChunk]) -> str:
    """
    Generate an answer grounded in the provided chunks.
    Returns the answer text string.
    """
    ...


if __name__ == "__main__":
    dummy_chunks = [
        RetrievedChunk(
            text="Merge patient records: Go to Administration module → Patient Management → Select two records → Click Merge",
            score=0.94,
            metadata={"subject": "Merge duplicate patient records"}
        ),
    ]
    answer = generate("How do I merge duplicate patient records in EHC?", dummy_chunks)
    print(f"[GENERATOR] Response: {answer}")
