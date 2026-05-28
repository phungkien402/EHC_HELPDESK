"""
RAG Quality Evaluation — runs the full pipeline against a test set and
reports accuracy metrics per category.

Usage:
    python -m tests.evaluate                # prints to stdout
    python -m tests.evaluate --write        # also writes JSON for the admin UI

CHANGES (v2 — admin UI integration):
  - --write flag dumps results to logs/eval_results_latest.json and appends
    a compact entry to logs/eval_history.jsonl.
  - The same evaluate_item() is called by api.admin._run_eval_blocking().
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.models import Message
from core import pipeline


EVAL_LATEST = "logs/eval_results_latest.json"
EVAL_HISTORY = "logs/eval_history.jsonl"


def load_eval_set() -> list[dict]:
    """Load the evaluation set from tests/eval_set.json."""
    eval_path = Path(__file__).parent / "eval_set.json"
    with open(eval_path, "r", encoding="utf-8") as f:
        return json.load(f)


def evaluate_item(item: dict) -> dict:
    """
    Run a single eval item through the pipeline and score it.
    Returns a result dict with pass/fail and details.
    """
    msg = Message(
        user_id="eval",
        session_id=item["id"],
        text=item["question"],
        timestamp=time.time(),
        platform="web",
    )

    start = time.time()
    answer = pipeline.run(msg, [])
    elapsed = time.time() - start

    result = {
        "id": item["id"],
        "question": item["question"],
        "type": item["type"],
        "expected_keywords": item.get("expected_keywords", []),
        "expected_faq_subject": item.get("expected_faq_subject", ""),
        "expected_behavior": item.get("expected_behavior", ""),
        "confidence": answer.confidence,
        "is_fallback": answer.is_fallback,
        "answer_text": answer.text,
        "elapsed": elapsed,
        "passed": False,
        "fail_reason": "",
        "actual_top_subject": (
            answer.source_chunks[0].metadata.get("subject", "")
            if answer.source_chunks else ""
        ),
    }

    if item["type"] in ("in_faq", "colloquial"):
        expected_kws = item.get("expected_keywords", [])
        answer_lower = answer.text.lower()
        searchable_text = answer_lower
        if answer.source_chunks:
            chunk_texts = " ".join(c.text.lower() for c in answer.source_chunks)
            searchable_text = answer_lower + " " + chunk_texts

        if answer.is_fallback:
            result["fail_reason"] = "Got fallback instead of answer"
        else:
            missing_kws = [kw for kw in expected_kws if kw.lower() not in searchable_text]
            if missing_kws:
                result["fail_reason"] = f"Missing keywords: {missing_kws}"
            else:
                result["passed"] = True

    elif item["type"] == "not_in_faq":
        if answer.is_fallback:
            result["passed"] = True
        else:
            result["fail_reason"] = f"Expected fallback, got answer (conf={answer.confidence:.2f})"

    elif item["type"] == "ambiguous":
        is_clarification = (
            "?" in answer.text
            or "mô tả" in answer.text.lower()
            or "chi tiết" in answer.text.lower()
            or "describe" in answer.text.lower()
        )
        if is_clarification:
            result["passed"] = True
        else:
            result["fail_reason"] = "Expected clarification question"

    return result


def print_results(results: list[dict]) -> None:
    """Print a formatted results table and summary."""
    print()
    print("=" * 78)
    print("  EHC RAG — Evaluation Results")
    print("=" * 78)
    print()
    print(f"{'ID':<10}{'Question':<40}{'Type':<12}{'Pass':<6}{'Conf':<10}{'Time'}")
    print(f"{'-'*9} {'-'*39} {'-'*11} {'-'*5} {'-'*9} {'-'*6}")

    for r in results:
        q_display = r["question"][:37] + "..." if len(r["question"]) > 37 else r["question"]
        status = "PASS" if r["passed"] else "FAIL"
        conf = f"{r['confidence']:.2f}" if r["type"] in ("in_faq", "colloquial") else "—"
        elapsed = f"{r['elapsed']:.1f}s"
        fail_marker = f"  ← {r['fail_reason']}" if not r["passed"] else ""
        print(f"{r['id']:<10}{q_display:<40}{r['type']:<12}{status:<6}{conf:<10}{elapsed}{fail_marker}")

    print()
    print("-" * 78)

    total_pass = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"Overall     : {total_pass} / {total} passed  ({100*total_pass/total:.1f}%)")

    for category in ("in_faq", "colloquial", "not_in_faq", "ambiguous"):
        cat_results = [r for r in results if r["type"] == category]
        if not cat_results:
            continue
        cat_pass = sum(1 for r in cat_results if r["passed"])
        cat_total = len(cat_results)
        label = {
            "in_faq": "In-FAQ",
            "colloquial": "Colloquial",
            "not_in_faq": "Fallback",
            "ambiguous": "Ambiguous",
        }[category]
        print(f"{label:<12}: {cat_pass} / {cat_total} ({100*cat_pass/cat_total:.1f}%)")

    avg_time = sum(r["elapsed"] for r in results) / len(results)
    print(f"Avg time    : {avg_time:.2f}s per question")


def write_results(results: list[dict]) -> None:
    """Write the eval results so the admin UI can read them."""
    def _cat_stats(cat: str) -> dict:
        cat_rs = [r for r in results if r["type"] == cat]
        passed = sum(1 for r in cat_rs if r["passed"])
        return {"total": len(cat_rs), "passed": passed}

    total_pass = sum(1 for r in results if r["passed"])
    avg_lat = sum(r["elapsed"] for r in results) / max(1, len(results))

    summary = {
        "last_run": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "last_run_ts": int(time.time()),
        "total": len(results),
        "total_passed": total_pass,
        "pass_rate": round(total_pass / max(1, len(results)), 4),
        "avg_latency": round(avg_lat, 3),
        "by_category": {
            "in_faq": _cat_stats("in_faq"),
            "colloquial": _cat_stats("colloquial"),
            "not_in_faq": _cat_stats("not_in_faq"),
            "ambiguous": _cat_stats("ambiguous"),
        },
        "cases": results,
    }

    os.makedirs(os.path.dirname(EVAL_LATEST), exist_ok=True)
    with open(EVAL_LATEST, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    history_entry = {
        "ts": summary["last_run_ts"],
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "pass_rate": summary["pass_rate"],
        "avg_latency": summary["avg_latency"],
        "total": summary["total"],
        "passed": total_pass,
        "by_category": summary["by_category"],
    }
    with open(EVAL_HISTORY, "a", encoding="utf-8") as f:
        f.write(json.dumps(history_entry, ensure_ascii=False) + "\n")
    print(f"\n[EVAL] Wrote {EVAL_LATEST} and appended to {EVAL_HISTORY}")


def main():
    """Run the full evaluation."""
    print("Loading evaluation set...")
    eval_set = load_eval_set()
    print(f"Loaded {len(eval_set)} questions.")
    print()
    print("Running pipeline on each question...")
    print("(This may take a while — models are loaded on first import)")
    print()

    results = []
    for i, item in enumerate(eval_set, 1):
        print(f"[{i}/{len(eval_set)}] {item['id']}: {item['question']}")
        result = evaluate_item(item)
        results.append(result)

    print_results(results)

    if "--write" in sys.argv:
        write_results(results)

    in_faq_results = [r for r in results if r["type"] in ("in_faq", "colloquial")]
    if in_faq_results:
        in_faq_pass = sum(1 for r in in_faq_results if r["passed"])
        in_faq_rate = in_faq_pass / len(in_faq_results)
        if in_faq_rate < 0.8:
            print(f"\nIn-FAQ accuracy ({in_faq_rate:.0%}) is below 80% target.")
            sys.exit(1)

    print("\nEvaluation complete.")


if __name__ == "__main__":
    main()
