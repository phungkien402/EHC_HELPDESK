"""
Zalo OA Adapter — implements BaseAdapter for the Zalo Official Account API.

Handles:
  - Parsing Zalo webhook events (only "user_send_text")
  - HMAC-SHA256 signature verification using ZALO_OA_SECRET
  - Sending messages via Zalo OA API

Run standalone: python -m adapters.zalo_adapter
"""

from adapters.base_adapter import BaseAdapter
from core.models import Message


class ZaloAdapter(BaseAdapter):

    def parse_message(self, raw: dict) -> Message | None:
        """Parse a Zalo webhook event. Only processes 'user_send_text'."""
        ...

    def format_response(self, answer_text: str, confidence: float) -> str:
        """Format response for Zalo (plain text)."""
        ...

    async def send_message(self, user_id: str, text: str) -> None:
        """Send message via Zalo OA API."""
        ...

    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """Verify HMAC-SHA256 signature from Zalo webhook."""
        ...


if __name__ == "__main__":
    adapter = ZaloAdapter()
    sample_event = {
        "event_name": "user_send_text",
        "sender": {"id": "user_zalo_123"},
        "message": {"text": "how to print medication order"},
        "timestamp": "1700000000"
    }
    msg = adapter.parse_message(sample_event)
    print(f"Parsed: {msg}")
