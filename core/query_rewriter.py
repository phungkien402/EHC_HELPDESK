"""
Query Rewriter — normalizes colloquial Vietnamese questions into formal queries.

Uses the LLM (via vLLM OpenAI-compatible API) to bridge the gap between how
doctors ask questions (short, informal) and how the FAQ is written (formal).

Run standalone: python -m core.query_rewriter
"""


def rewrite(text: str) -> str:
    """
    Rewrite a colloquial question into a formal, complete query.
    Returns the rewritten question string.
    """
    ...


if __name__ == "__main__":
    test_queries = [
        "merge patient records how?",
        "print medication order where",
        "record locked what do",
    ]
    for q in test_queries:
        result = rewrite(q)
        print(f"[REWRITER] Original : {q!r}")
        print(f"[REWRITER] Rewritten: {result!r}")
        print()
