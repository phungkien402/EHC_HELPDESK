"""
Telegram Adapter — implements BaseAdapter for the Telegram Bot API.

Handles:
  - Parsing Telegram Update webhook payloads into Message objects
  - Formatting responses with MarkdownV2
  - Sending messages via the Telegram Bot API

Run standalone: python -m adapters.telegram_adapter
"""

from adapters.base_adapter import BaseAdapter
from core.models import Message


class TelegramAdapter(BaseAdapter):

    def parse_message(self, raw: dict) -> Message | None:
        """Parse a Telegram Update object. Only handles text messages."""
        ...

    def format_response(self, answer_text: str, confidence: float) -> str:
        """Format response for Telegram (MarkdownV2)."""
        ...

    async def send_message(self, user_id: str, text: str) -> None:
        """Send message via Telegram Bot API."""
        ...


if __name__ == "__main__":
    adapter = TelegramAdapter()
    sample_update = {
        "message": {
            "from": {"id": 12345},
            "chat": {"id": 12345},
            "date": 1700000000,
            "text": "how to merge patient records"
        }
    }
    msg = adapter.parse_message(sample_update)
    print(f"Parsed: {msg}")
