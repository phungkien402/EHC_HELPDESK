"""
Query Logger — logs every query and its outcome to logs/queries.jsonl.

Fallback entries are especially important — they tell the helpdesk team
which questions need new FAQ entries.

The admin panel reads this file to display the log table.

Run standalone: python -m api.logger

CHANGES (v2 — admin UI integration):
  - Added session_id, source_url, latency_s, and full chunks list to log entries
  - log() now accepts an optional latency_s argument
  - read_logs() supports newest-first ordering and id stamping
  - New read_log_by_id() for the detail drawer
  - Old JSONL entries without the new fields are still readable
    (missing keys default to empty/0)
"""

from dataclasses import dataclass, field, asdict
import json
import os
import time
from typing import Any


@dataclass
class QueryLog:
    """A single logged query entry."""
    timestamp: float
    user_id: str
    session_id: str
    platform: str
    question: str
    rewritten_question: str
    answer: str
    confidence: float
    is_fallback: bool
    top_chunk_subject: str
    source_url: str = ""
    latency_s: float = 0.0
    chunks: list = field(default_factory=list)
    # chunks: [{"score": float, "subject": str, "snippet": str, "url": str}]


class QueryLogger:
    """Appends query logs as JSON lines to a file."""

    def __init__(self, log_path: str = "logs/queries.jsonl"):
        self._log_path = log_path

    def log(self, message, answer, latency_s: float = 0.0) -> None:
        """
        Log a query and its answer.
        latency_s is the wall-clock time for the pipeline run.
        """
        os.makedirs(os.path.dirname(self._log_path), exist_ok=True)

        chunks_payload = []
        for c in (answer.source_chunks or []):
            text = c.text or ""
            chunks_payload.append({
                "score": round(float(c.score), 4),
                "subject": c.metadata.get("subject", ""),
                "url": c.metadata.get("url", ""),
                "snippet": (text[:400] + "…") if len(text) > 400 else text,
            })

        top_chunk_subject = ""
        source_url = ""
        if answer.source_chunks:
            top_chunk_subject = answer.source_chunks[0].metadata.get("subject", "")
            source_url = answer.source_chunks[0].metadata.get("url", "")

        entry = QueryLog(
            timestamp=time.time(),
            user_id=message.user_id,
            session_id=getattr(message, "session_id", ""),
            platform=message.platform,
            question=message.text,
            rewritten_question=answer.rewritten_question,
            answer=answer.text,
            confidence=float(answer.confidence),
            is_fallback=bool(answer.is_fallback),
            top_chunk_subject=top_chunk_subject,
            source_url=source_url,
            latency_s=round(float(latency_s), 3),
            chunks=chunks_payload,
        )
        with open(self._log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(entry), ensure_ascii=False) + "\n")

    # ------------------------------------------------------------------
    # Read API used by the admin endpoints
    # ------------------------------------------------------------------

    def _read_all(self) -> list[dict]:
        """Read ALL log entries from disk, stamping a stable id per line."""
        if not os.path.exists(self._log_path):
            return []
        out: list[dict] = []
        with open(self._log_path, encoding="utf-8") as f:
            for i, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                # Stable id = file line number (1-based)
                obj.setdefault("id", i + 1)
                # Backfill new fields for old entries
                obj.setdefault("session_id", "")
                obj.setdefault("source_url", "")
                obj.setdefault("latency_s", 0.0)
                obj.setdefault("chunks", [])
                out.append(obj)
        return out

    def read_logs(
        self,
        limit: int = 50,
        fallback_only: bool = False,
        platform: str | None = None,
        since_ts: float | None = None,
        search: str | None = None,
        newest_first: bool = True,
    ) -> list[dict]:
        """Read recent logs, with optional filters.

        Default behavior (limit=50, fallback_only=False) is backwards-compatible
        with the original implementation but now returns newest-first.
        """
        logs = self._read_all()

        if fallback_only:
            logs = [l for l in logs if l.get("is_fallback")]
        if platform:
            logs = [l for l in logs if l.get("platform") == platform]
        if since_ts is not None:
            logs = [l for l in logs if l.get("timestamp", 0) >= since_ts]
        if search:
            s = search.lower()
            logs = [
                l for l in logs
                if s in l.get("question", "").lower()
                or s in l.get("user_id", "").lower()
                or s in l.get("rewritten_question", "").lower()
            ]

        if newest_first:
            logs.reverse()
        return logs[:limit]

    def read_log_by_id(self, log_id: int) -> dict | None:
        """Return one log entry (with full chunks) by its stable id."""
        for log in self._read_all():
            if log.get("id") == log_id:
                return log
        return None

    def read_all(self) -> list[dict]:
        """Public alias used by analytics endpoints."""
        return self._read_all()


if __name__ == "__main__":
    from core.models import Message, Answer, RetrievedChunk

    logger = QueryLogger("logs/test_queries.jsonl")
    msg = Message(
        user_id="test", session_id="s1",
        text="test question", timestamp=0.0, platform="web"
    )
    chunk = RetrievedChunk(
        text="Sample retrieved chunk body text",
        score=0.91,
        metadata={"subject": "Test FAQ", "url": "https://redmine.local/issues/1"},
    )
    ans = Answer(
        text="test answer", confidence=0.9,
        rewritten_question="rewritten test question",
        source_chunks=[chunk],
    )
    logger.log(msg, ans, latency_s=2.34)
    logs = logger.read_logs()
    print(f"Logged {len(logs)} entries:")
    print(json.dumps(logs[0], indent=2, ensure_ascii=False))
    print("✓ QueryLogger v2 works correctly.")
