"""
Web Adapter — the simplest adapter, used by the Web Chat UI and for testing.

- parse_message: wraps raw JSON directly into a Message
- format_response: returns plain text (no special formatting)
- send_message: no-op (Web uses the HTTP response directly)

Run standalone: python -m adapters.web_adapter
"""

from adapters.base_adapter import BaseAdapter
from core.models import Message


class WebAdapter(BaseAdapter):

    def parse_message(self, raw: dict) -> Message | None:
        """Parse a web chat JSON payload into a Message."""
        ...

    def format_response(self, answer_text: str, confidence: float) -> str:
        """Return plain text — no special formatting for web."""
        ...

    async def send_message(self, user_id: str, text: str) -> None:
        """No-op — web uses HTTP response directly."""
        pass


if __name__ == "__main__":
    adapter = WebAdapter()
    sample = {
        "user_id": "web_tester",
        "session_id": "s1",
        "text": "how to merge patient records"
    }
    msg = adapter.parse_message(sample)
    print(f"Parsed: {msg}")
