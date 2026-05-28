"""
Admin analytics endpoints — read-only views over the query log + system state.

Mounted from api/routes.py:
    from api.admin import router as admin_router
    app.include_router(admin_router)

All endpoints are JSON. None require auth (except the runtime-toggle ones in
routes.py which still use ADMIN_TOKEN). Add an auth dependency here if you
expose this beyond the LAN.

Endpoints
---------
GET  /admin/metrics?days=1            KPIs + sparklines (volume, fallback rate, latency, users)
GET  /admin/logs/{log_id}             Full detail for one log entry (chunks included)
GET  /admin/failing?limit=20          Failing/fallback questions grouped + suggested actions
GET  /admin/eval/results              Latest eval run + 7-day history
POST /admin/eval/run                  Trigger eval in background, writes results to disk
GET  /admin/system/status             Health of Qdrant + vLLM + FastAPI + Redmine + last reindex
"""

import json
import os
import re
import time
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from config import (
    QDRANT_URL,
    QDRANT_COLLECTION,
    VLLM_BASE_URL,
    VLLM_MODEL,
    REDMINE_URL,
    REDMINE_PROJECT,
    EMBED_MODEL,
    RERANKER_MODEL,
    EMBED_DEVICE,
    RERANKER_DEVICE,
    CONFIDENCE_THRESHOLD,
)

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# Process start time — used for FastAPI uptime
# ---------------------------------------------------------------------------
_API_START_TS = time.time()

LOG_PATH = "logs/queries.jsonl"
EVAL_LATEST = "logs/eval_results_latest.json"
EVAL_HISTORY = "logs/eval_history.jsonl"
LAST_INDEX_FILE = ".last_index_time"


# ---------------------------------------------------------------------------
# Shared log reader (lazy)
# ---------------------------------------------------------------------------
def _logger():
    from api.logger import QueryLogger
    return QueryLogger(LOG_PATH)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _norm_question(q: str) -> str:
    """Normalize a question for grouping (lowercase, strip accents, collapse ws)."""
    q = (q or "").lower().strip()
    q = unicodedata.normalize("NFC", q)
    q = re.sub(r"\s+", " ", q)
    q = re.sub(r"[?!.,;:'\"]+$", "", q)
    return q


def _human_uptime(seconds: float) -> str:
    s = int(seconds)
    days, s = divmod(s, 86400)
    hours, s = divmod(s, 3600)
    mins, _ = divmod(s, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {mins}m"
    return f"{mins}m"


def _human_relative(ts_iso_or_unix) -> str:
    if not ts_iso_or_unix:
        return "—"
    if isinstance(ts_iso_or_unix, (int, float)):
        ts = float(ts_iso_or_unix)
    else:
        try:
            ts = datetime.fromisoformat(str(ts_iso_or_unix).replace("Z", "+00:00")).timestamp()
        except Exception:
            return str(ts_iso_or_unix)
    diff = max(0, time.time() - ts)
    return _human_uptime(diff) + " ago"


def _bucketize(values: list[float], n_buckets: int = 10) -> list[int]:
    """Bucketize confidence scores into n_buckets (0.0 .. 1.0)."""
    buckets = [0] * n_buckets
    for v in values:
        idx = min(n_buckets - 1, max(0, int(v * n_buckets)))
        buckets[idx] += 1
    return buckets


def _series_by_day(logs: list[dict], days: int = 28, key: str = "count") -> list[float]:
    """Build a per-day series for the last `days` days (oldest first)."""
    if not logs:
        return [0.0] * days
    now = time.time()
    day_sec = 86400
    series_count = [0] * days
    series_sum = [0.0] * days
    series_fb = [0] * days
    for log in logs:
        ts = log.get("timestamp", 0)
        days_ago = int((now - ts) // day_sec)
        if 0 <= days_ago < days:
            idx = days - 1 - days_ago
            series_count[idx] += 1
            series_sum[idx] += float(log.get("latency_s", 0))
            if log.get("is_fallback"):
                series_fb[idx] += 1
    if key == "count":
        return [float(x) for x in series_count]
    if key == "avg_latency":
        return [round(s / c, 3) if c else 0.0 for s, c in zip(series_sum, series_count)]
    if key == "fallback_pct":
        return [
            round(100.0 * f / c, 2) if c else 0.0
            for f, c in zip(series_fb, series_count)
        ]
    return [0.0] * days


# ---------------------------------------------------------------------------
# GET /admin/metrics
# ---------------------------------------------------------------------------
@router.get("/metrics")
def get_metrics(days: int = Query(1, ge=1, le=30)):
    """Compute KPIs and sparklines from the query log."""
    all_logs = _logger().read_all()
    now = time.time()
    day_sec = 86400

    today_lo = now - days * day_sec
    yest_lo = now - 2 * days * day_sec
    yest_hi = today_lo

    today = [l for l in all_logs if l.get("timestamp", 0) >= today_lo]
    yest = [l for l in all_logs if yest_lo <= l.get("timestamp", 0) < yest_hi]

    def _kpis(logs: list[dict]) -> dict:
        if not logs:
            return {"count": 0, "fallback_rate": 0.0, "avg_latency": 0.0,
                    "p95_latency": 0.0, "users": 0}
        lats = sorted(float(l.get("latency_s", 0)) for l in logs if l.get("latency_s"))
        p95 = lats[int(0.95 * (len(lats) - 1))] if lats else 0.0
        fb = sum(1 for l in logs if l.get("is_fallback"))
        return {
            "count": len(logs),
            "fallback_rate": round(fb / len(logs), 4),
            "avg_latency": round(sum(lats) / max(1, len(lats)), 3),
            "p95_latency": round(p95, 3),
            "users": len({l.get("user_id", "") for l in logs if l.get("user_id")}),
        }

    today_k = _kpis(today)
    yest_k = _kpis(yest)

    # Confidence distribution — split by outcome
    ok_scores = [float(l.get("confidence", 0)) for l in today if not l.get("is_fallback")]
    fb_scores = [float(l.get("confidence", 0)) for l in today if l.get("is_fallback")]

    return {
        "as_of": int(now),
        "window_days": days,
        "totals": {
            "today": today_k["count"],
            "yesterday": yest_k["count"],
        },
        "fallback_rate": {
            "today": today_k["fallback_rate"],
            "yesterday": yest_k["fallback_rate"],
        },
        "avg_latency": {
            "today": today_k["avg_latency"],
            "yesterday": yest_k["avg_latency"],
            "p95_today": today_k["p95_latency"],
            "p95_yesterday": yest_k["p95_latency"],
        },
        "active_users": {
            "today": today_k["users"],
            "yesterday": yest_k["users"],
        },
        "sparkline_volume": _series_by_day(all_logs, 28, "count"),
        "sparkline_latency": _series_by_day(all_logs, 28, "avg_latency"),
        "sparkline_fallback_pct": _series_by_day(all_logs, 28, "fallback_pct"),
        "confidence_distribution": {
            "answered": _bucketize(ok_scores, 10),
            "fallback": _bucketize(fb_scores, 10),
        },
        "confidence_threshold": CONFIDENCE_THRESHOLD,
    }


# ---------------------------------------------------------------------------
# GET /admin/logs/{log_id}
# ---------------------------------------------------------------------------
@router.get("/logs/{log_id}")
def get_log_detail(log_id: int):
    """Full detail (including chunks) for one log entry."""
    log = _logger().read_log_by_id(log_id)
    if log is None:
        raise HTTPException(status_code=404, detail=f"Log #{log_id} not found")
    return log


# ---------------------------------------------------------------------------
# GET /admin/failing
# ---------------------------------------------------------------------------
@router.get("/failing")
def get_failing(limit: int = Query(20, ge=1, le=100), days: int = Query(7, ge=1, le=90)):
    """Group failing/low-confidence questions and suggest next steps."""
    all_logs = _logger().read_all()
    since = time.time() - days * 86400
    recent = [l for l in all_logs if l.get("timestamp", 0) >= since]

    failing = [
        l for l in recent
        if l.get("is_fallback") or float(l.get("confidence", 0)) < CONFIDENCE_THRESHOLD
    ]

    groups: dict[str, dict] = {}
    for l in failing:
        key = _norm_question(l.get("question", ""))
        if not key:
            continue
        g = groups.setdefault(key, {
            "question": l["question"],
            "count": 0,
            "last_seen_ts": 0,
            "conf_sum": 0.0,
            "any_fallback": False,
            "top_subject_seen": "",
        })
        g["count"] += 1
        g["conf_sum"] += float(l.get("confidence", 0))
        g["last_seen_ts"] = max(g["last_seen_ts"], l.get("timestamp", 0))
        if l.get("is_fallback"):
            g["any_fallback"] = True
        if l.get("top_chunk_subject"):
            g["top_subject_seen"] = l["top_chunk_subject"]

    out = []
    for g in groups.values():
        avg = g["conf_sum"] / max(1, g["count"])
        if g["any_fallback"]:
            suggested = "No FAQ matched — write a new entry"
        elif avg < 0.3:
            suggested = "Very low confidence — write a new entry"
        elif g["top_subject_seen"]:
            suggested = f"Related FAQ exists ({g['top_subject_seen']}) — improve wording / keywords"
        else:
            suggested = "Low confidence — review retrieval"
        out.append({
            "question": g["question"],
            "count": g["count"],
            "avg_confidence": round(avg, 4),
            "any_fallback": g["any_fallback"],
            "last_seen_ts": int(g["last_seen_ts"]),
            "last_seen_human": _human_relative(g["last_seen_ts"]),
            "suggested": suggested,
        })
    out.sort(key=lambda x: x["count"], reverse=True)
    return {"days": days, "count": len(out), "items": out[:limit]}


# ---------------------------------------------------------------------------
# GET /admin/eval/results
# ---------------------------------------------------------------------------
@router.get("/eval/results")
def get_eval_results():
    """Read the most recent eval run + the historical pass-rate trend."""
    latest = None
    if os.path.exists(EVAL_LATEST):
        try:
            with open(EVAL_LATEST, encoding="utf-8") as f:
                latest = json.load(f)
        except Exception:
            latest = None

    history: list[dict] = []
    if os.path.exists(EVAL_HISTORY):
        with open(EVAL_HISTORY, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    history.append(json.loads(line))
                except Exception:
                    continue
    history = history[-30:]

    return {
        "latest": latest,
        "history": history,
    }


# ---------------------------------------------------------------------------
# POST /admin/eval/run
# ---------------------------------------------------------------------------
def _run_eval_blocking():
    """Run the eval suite and write results to disk. Heavy — invoke as background task."""
    try:
        from tests.evaluate import load_eval_set, evaluate_item

        eval_set = load_eval_set()
        results = [evaluate_item(item) for item in eval_set]

        # Build summary
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

        # Append a compact entry to history
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

        print(f"[EVAL] Done — {total_pass}/{len(results)} passed.")
    except Exception as e:
        print(f"[EVAL] Failed: {e}")


@router.post("/eval/run")
def post_eval_run(background_tasks: BackgroundTasks):
    """Kick off the eval in the background. Poll /admin/eval/results for the outcome."""
    background_tasks.add_task(_run_eval_blocking)
    return {"status": "started", "message": "Evaluation running in background. Poll /admin/eval/results."}


# ---------------------------------------------------------------------------
# GET /admin/system/status
# ---------------------------------------------------------------------------
@router.get("/system/status")
def get_system_status():
    """Health and stats for every service in the pipeline."""
    out = {
        "as_of": int(time.time()),
        "fastapi": {
            "status": "healthy",
            "uptime_seconds": int(time.time() - _API_START_TS),
            "uptime": _human_uptime(time.time() - _API_START_TS),
        },
        "qdrant": _qdrant_status(),
        "vllm": _vllm_status(),
        "embedder": {
            "model": EMBED_MODEL,
            "device": EMBED_DEVICE,
            "status": "loaded",
        },
        "reranker": {
            "model": RERANKER_MODEL,
            "device": RERANKER_DEVICE,
            "status": "loaded",
        },
        "redmine": {
            "url": REDMINE_URL,
            "project": REDMINE_PROJECT,
            "status": "unknown",
            "last_reindex": _last_reindex(),
        },
        "maintenance_mode": _maintenance_state(),
        "cache_sizes": _cache_sizes(),
    }
    return out


def _qdrant_status() -> dict:
    out = {
        "url": QDRANT_URL,
        "collection": QDRANT_COLLECTION,
        "status": "unknown",
        "points_count": None,
        "indexed_vectors_count": None,
    }
    try:
        with httpx.Client(timeout=2.0) as c:
            r = c.get(f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}")
            if r.status_code == 200:
                info = r.json().get("result", {})
                out["status"] = "healthy"
                out["points_count"] = info.get("points_count")
                out["indexed_vectors_count"] = info.get("indexed_vectors_count")
            else:
                out["status"] = "degraded"
                out["error"] = f"HTTP {r.status_code}"
    except Exception as e:
        out["status"] = "down"
        out["error"] = str(e)[:120]
    return out


def _vllm_status() -> dict:
    out = {
        "url": VLLM_BASE_URL,
        "model": VLLM_MODEL,
        "status": "unknown",
    }
    try:
        with httpx.Client(timeout=2.0) as c:
            r = c.get(f"{VLLM_BASE_URL}/v1/models")
            if r.status_code == 200:
                out["status"] = "healthy"
                data = r.json().get("data", [])
                if data:
                    out["loaded_models"] = [m.get("id") for m in data]
            else:
                out["status"] = "degraded"
                out["error"] = f"HTTP {r.status_code}"
    except Exception as e:
        out["status"] = "down"
        out["error"] = str(e)[:120]
    return out


def _last_reindex() -> Optional[str]:
    p = Path(LAST_INDEX_FILE)
    if p.exists():
        return p.read_text().strip()
    return None


def _maintenance_state() -> bool:
    try:
        from core.pipeline import is_maintenance_mode
        return bool(is_maintenance_mode())
    except Exception:
        return False


def _cache_sizes() -> dict:
    try:
        from core.cache import rewrite_cache, retrieval_cache, answer_cache
        return {
            "rewrite": rewrite_cache.stats(),
            "retrieval": retrieval_cache.stats(),
            "answer": answer_cache.stats(),
        }
    except Exception:
        return {}
