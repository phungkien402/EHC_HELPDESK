"""
Fallback Handler — handles cases where the RAG pipeline cannot confidently
answer the user's question.

Three cases:
1. Question is ambiguous (< 5 words or unclear intent) → ask for clarification
2. Already asked for clarification in this session → escalate to helpdesk
3. Question is clear but not found in FAQ → escalate to helpdesk

Run standalone: python -m core.fallback
"""

from core.models import Message, Answer


def handle(message: Message, session_history: list) -> Answer:
    """
    Determine the appropriate fallback response based on the message
    and conversation history.
    Returns an Answer with is_fallback=True.
    """
    ...


if __name__ == "__main__":
    msg = Message(
        user_id="test", session_id="s1",
        text="huh??", timestamp=0.0, platform="web"
    )
    # Test case 1: ambiguous question, no history
    answer = handle(msg, [])
    print(f"[FALLBACK] Input: {msg.text!r}")
    print(f"[FALLBACK] Response: {answer}")
