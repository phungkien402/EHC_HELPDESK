"""
RAG Pipeline orchestrator.
Accepts a standard Message object, runs it through 5 steps:
  Query Rewriter -> Retriever -> Reranker -> Generator -> Confidence Check
Returns an Answer object or delegates to the Fallback Handler.

Run standalone: python -m core.pipeline
"""

import time

from core.models import Message, Answer
from core import query_rewriter, retriever, reranker, generator, confidence, fallback


def run(message: Message, session_history: list) -> Answer:
    """
    Execute the full RAG pipeline on a message.
    Returns an Answer (either generated or fallback).
    """
    ...


if __name__ == "__main__":
    print("=== EHC RAG Pipeline — Interactive Test ===")
    print("Type a question (or 'quit' to exit):\n")
    while True:
        q = input("You: ").strip()
        if q == "quit":
            break
        msg = Message(
            user_id="test", session_id="s1",
            text=q, timestamp=time.time(), platform="web"
        )
        answer = run(msg, [])
        print(f"\nBot: {answer.text}")
        print(f"     [confidence={answer.confidence:.2f}  fallback={answer.is_fallback}]\n")
