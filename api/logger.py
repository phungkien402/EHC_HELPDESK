"""
Query Logger — logs every query and its outcome to logs/queries.jsonl.

Fallback entries are especially important — they tell the helpdesk team
which questions need new FAQ entries.

The admin panel reads this file to display the log table.

Run standalone: python -m api.logger
"""

from dataclasses import dataclass, asdict
import json


@dataclass
class QueryLog:
    """A single logged query entry."""
    timestamp: float
    user_id: str
    platform: str
    question: str
    rewritten_question: str
    answer: str
    confidence: float
    is_fallback: bool
    top_chunk_subject: str  # FAQ title used (empty string if fallback)


class QueryLogger:
    """Appends query logs as JSON lines to a file."""

    def __init__(self, log_path: str = "logs/queries.jsonl"):
        self._log_path = log_path

    def log(self, message, answer) -> None:
        """
        Log a query and its answer.
        Uses answer.rewritten_question for the rewritten field.
        """
        ...

    def read_logs(self, limit: int = 50, fallback_only: bool = False) -> list[dict]:
        """Read recent logs from the file."""
        ...


if __name__ == "__main__":
    logger = QueryLogger()
    print(f"Log path: {logger._log_path}")
    print("✓ QueryLogger instantiates correctly.")
