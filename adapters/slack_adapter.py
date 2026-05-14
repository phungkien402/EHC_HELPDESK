"""
Slack Adapter — implements BaseAdapter for Slack Events API.

Handles:
  - app_mention events — when someone tags @EHC Bot in a channel
  - Sending replies via Slack Web API (chat.postMessage)
  - Signature verification using HMAC-SHA256

Note: URL verification challenge is handled in api/routes.py before
reaching this adapter, since it's not a real message event.

Env vars needed:
  SLACK_BOT_TOKEN=xoxb-...
  SLACK_SIGNING_SECRET=...
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import hashlib
import hmac
import re
import time

import httpx

from adapters.base_adapter import BaseAdapter
from core.models import Message
from config import SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET


# Module-level dict to store thread_ts for replies (session_id -> event ts)
_pending_thread_ts: dict[str, str] = {}


class SlackAdapter(BaseAdapter):

    def parse_message(self, raw: dict) -> Message | None:
        """
        Parse a Slack Events API payload.
        Only handles event_type == "app_mention". Ignores everything else.
        """
        event = raw.get("event")
        if not event:
            return None

        # Only respond to app_mention events
        if event.get("type") != "app_mention":
            return None

        text = event.get("text", "")
        # Strip the bot mention (e.g. <@U12345>) from the text
        text = re.sub(r"<@[A-Z0-9]+>", "", text).strip()

        if not text:
            return None

        user_id = event.get("user", "")
        channel_id = event.get("channel", "")
        ts_str = event.get("ts", "")
        ts = float(ts_str) if ts_str else time.time()

        if not user_id or not channel_id:
            return None

        # Store thread_ts so send_message can reply in-thread
        session_id = f"slack_{channel_id}"
        _pending_thread_ts[session_id] = ts_str

        return Message(
            user_id=user_id,
            session_id=session_id,
            text=text,
            timestamp=ts,
            platform="slack",
        )

    def format_response(self, answer_text: str, confidence: float) -> str:
        """Format response for Slack — plain text with confidence footer."""
        if confidence > 0:
            return f"{answer_text}\n\n📊 Độ tin cậy: {confidence:.0%}"
        return answer_text

    async def send_message(self, channel_id: str, text: str) -> None:
        """Send message via Slack Web API (chat.postMessage), replying in-thread."""
        if not SLACK_BOT_TOKEN:
            print("[SLACK] No bot token configured, skipping send")
            return

        url = "https://slack.com/api/chat.postMessage"
        headers = {
            "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
            "Content-Type": "application/json",
        }
        payload = {
            "channel": channel_id,
            "text": text,
        }

        # Reply in-thread if we have the original message ts
        session_key = f"slack_{channel_id}"
        thread_ts = _pending_thread_ts.pop(session_key, None)
        if thread_ts:
            payload["thread_ts"] = thread_ts

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
            data = resp.json()
            if not data.get("ok"):
                print(f"[SLACK] Send failed: {data.get('error', 'unknown')}")
            else:
                print(f"[SLACK] Message sent to {channel_id} (thread={thread_ts or 'none'})")

    @staticmethod
    def verify_signature(
        signing_secret: str, timestamp: str, body: bytes, signature: str
    ) -> bool:
        """
        Verify the X-Slack-Signature header using HMAC-SHA256.
        Returns True if the request is authentic.
        """
        # Reject requests older than 5 minutes to prevent replay attacks
        if abs(time.time() - int(timestamp)) > 300:
            return False

        sig_basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
        computed = (
            "v0="
            + hmac.new(
                signing_secret.encode(), sig_basestring.encode(), hashlib.sha256
            ).hexdigest()
        )

        return hmac.compare_digest(computed, signature)


if __name__ == "__main__":
    adapter = SlackAdapter()

    # Test parse — app_mention event
    sample_event = {
        "event": {
            "type": "app_mention",
            "user": "U12345",
            "channel": "C67890",
            "text": "<@UBOTID> in phiếu không lên form view",
            "ts": "1700000000.000100",
        }
    }
    msg = adapter.parse_message(sample_event)
    print(f"Parsed: {msg}")
    assert msg is not None
    assert msg.text == "in phiếu không lên form view"
    assert msg.session_id == "slack_C67890"
    assert msg.platform == "slack"

    # Test ignore non-mention events
    non_mention = {"event": {"type": "message", "user": "U12345", "text": "hello"}}
    assert adapter.parse_message(non_mention) is None

    # Test format
    formatted = adapter.format_response("Vào Module Hành chính → Gộp hồ sơ", 0.95)
    print(f"Formatted:\n{formatted}")

    print("\n✓ SlackAdapter works correctly.")
