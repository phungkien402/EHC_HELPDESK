# IMPLEMENT: Admin Stats Endpoints

_Branch: LOCAL_ASSISTANT_

## Goal

Add 3 new read-only endpoints to `api/routes.py` so the admin console
at `/admin/` can display real data instead of mock data.

```
GET /admin/stats/queries    ← aggregated query metrics + log table
GET /admin/stats/health     ← service health (vLLM, Qdrant, FastAPI)
GET /admin/stats/resources  ← CPU / RAM / Disk / GPU
```

Also add `latency_ms` field to `QueryLog` and measure it in `handle_webhook`.

## Project path

```
/home/phungkien/EHC_HELPDESK
```

---

## Step 0 — Read source files first

Read these files in full before making any changes:

- `api/routes.py`
- `api/logger.py`

---

## Change 1 — Add `latency_ms` to `api/logger.py`

### 1a. Add field to dataclass

```python
@dataclass
class QueryLog:
    timestamp: float
    user_id: str
    platform: str
    question: str
    rewritten_question: str
    answer: str
    confidence: float
    is_fallback: bool
    top_chunk_subject: str
    latency_ms: float = 0.0    # ← ADD THIS
```

### 1b. Update `log()` method signature

```python
def log(self, message, answer, latency_ms: float = 0.0) -> None:
```

Add `latency_ms=latency_ms` to the `QueryLog(...)` constructor call inside `log()`.

---

## Change 2 — Measure latency in `handle_webhook` (`api/routes.py`)

Find the section in `handle_webhook` that calls `run_pipeline`:

```python
# Add before run_pipeline call:
import time
_t0 = time.time()

answer = await loop.run_in_executor(None, run_pipeline, message, session_history)

# Add after:
_latency_ms = (time.time() - _t0) * 1000

# Update the log call:
_logger.log(message, answer, latency_ms=_latency_ms)
```

---

## Change 3 — Add `/admin/stats/queries` endpoint

Add to `api/routes.py`:

```python
@app.get("/admin/stats/queries")
async def stats_queries(days: int = 7):
    """
    Returns aggregated query stats from logs/queries.jsonl.

    {
      "total_queries": 312,
      "total_fallbacks": 45,
      "fallback_rate": 0.144,
      "avg_confidence": 0.71,
      "avg_latency_ms": 4290.0,
      "by_day": [
        {"date": "2026-05-20", "count": 48, "fallbacks": 6},
        ...
      ],
      "by_platform": {"slack": 290, "web": 22},
      "top_unanswered": [
        {"question": "...", "count": 5, "last_seen": "2026-05-25"},
        ...
      ],
      "recent_logs": [
        {
          "id": 4821,
          "timestamp": 1716038400.0,
          "user_id": "bs.nguyenvana",
          "platform": "slack",
          "question": "...",
          "rewritten_question": "...",
          "answer": "...",
          "confidence": 0.88,
          "is_fallback": false,
          "latency_ms": 4120.0,
          "top_chunk_subject": "..."
        },
        ...
      ]
    }
    """
    import json
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict, Counter

    log_path = Path(__file__).parent.parent / "logs" / "queries.jsonl"
    unanswered_path = Path(__file__).parent.parent / "data" / "unanswered.jsonl"

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).timestamp()

    logs = []
    if log_path.exists():
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("timestamp", 0) >= cutoff:
                        logs.append(entry)
                except Exception:
                    continue

    total = len(logs)
    fallbacks = sum(1 for l in logs if l.get("is_fallback", False))
    fallback_rate = round(fallbacks / total, 4) if total else 0.0

    conf_values = [l["confidence"] for l in logs if not l.get("is_fallback") and "confidence" in l]
    avg_confidence = round(sum(conf_values) / len(conf_values), 4) if conf_values else 0.0

    lat_values = [l["latency_ms"] for l in logs if l.get("latency_ms", 0) > 0]
    avg_latency_ms = round(sum(lat_values) / len(lat_values), 1) if lat_values else 0.0

    # by_day
    day_counts: dict = defaultdict(lambda: {"count": 0, "fallbacks": 0})
    for l in logs:
        day = datetime.fromtimestamp(l["timestamp"], tz=timezone.utc).date().isoformat()
        day_counts[day]["count"] += 1
        if l.get("is_fallback"):
            day_counts[day]["fallbacks"] += 1
    by_day = [{"date": d, **v} for d, v in sorted(day_counts.items())]

    # by_platform
    platform_counts: Counter = Counter(l.get("platform", "unknown") for l in logs)
    by_platform = dict(platform_counts)

    # top_unanswered from data/unanswered.jsonl
    top_unanswered = []
    if unanswered_path.exists():
        unanswered_raw = []
        with open(unanswered_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    unanswered_raw.append(json.loads(line))
                except Exception:
                    continue
        # Group by question text, count occurrences
        q_groups: dict = defaultdict(lambda: {"count": 0, "last_seen": 0.0})
        for entry in unanswered_raw:
            q = entry.get("question", "").strip()
            if not q:
                continue
            q_groups[q]["count"] += 1
            ts = entry.get("timestamp", 0.0)
            if ts > q_groups[q]["last_seen"]:
                q_groups[q]["last_seen"] = ts
        top_unanswered = sorted(
            [
                {
                    "question": q,
                    "count": v["count"],
                    "last_seen": datetime.fromtimestamp(v["last_seen"], tz=timezone.utc).date().isoformat()
                    if v["last_seen"] else "",
                }
                for q, v in q_groups.items()
            ],
            key=lambda x: -x["count"],
        )[:10]

    # recent_logs — last 50, newest first, include id for table key
    recent = list(reversed(logs[-50:]))
    for i, entry in enumerate(recent):
        entry["id"] = 9000 - i   # stable synthetic id for React key

    return {
        "total_queries": total,
        "total_fallbacks": fallbacks,
        "fallback_rate": fallback_rate,
        "avg_confidence": avg_confidence,
        "avg_latency_ms": avg_latency_ms,
        "by_day": by_day,
        "by_platform": by_platform,
        "top_unanswered": top_unanswered,
        "recent_logs": recent,
    }
```

---

## Change 4 — Add `/admin/stats/health` endpoint

```python
@app.get("/admin/stats/health")
async def stats_health():
    """
    Check all service dependencies. Responds in < 2 seconds.

    {
      "fastapi": "ok",
      "qdrant": "ok",
      "vllm": "ok",
      "timestamp": 1716038400.0
    }

    Each status: "ok" | "error" | "timeout"
    """
    import httpx
    import time

    async def check(name: str, url: str, timeout: float = 1.5) -> tuple[str, str]:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(url)
                if resp.status_code < 500:
                    return name, "ok"
                return name, "error"
        except httpx.TimeoutException:
            return name, "timeout"
        except Exception:
            return name, "error"

    results = await asyncio.gather(
        check("qdrant", "http://localhost:6333/healthz"),
        check("vllm",   "http://localhost:8000/health"),
        return_exceptions=True,
    )

    health: dict[str, str] = {"fastapi": "ok"}
    for r in results:
        if isinstance(r, tuple):
            health[r[0]] = r[1]
        # If gather itself returned an exception, the service is "error"

    health["timestamp"] = time.time()
    return health
```

**Note:** `httpx` must be available. Check `requirements.txt`:
```
httpx>=0.27.0
```
If missing, add it and run `pip install httpx --break-system-packages`.

---

## Change 5 — Add `/admin/stats/resources` endpoint

```python
@app.get("/admin/stats/resources")
async def stats_resources():
    """
    System resource snapshot.

    {
      "cpu_percent": 34.2,
      "ram_used_gb": 48.3,
      "ram_total_gb": 128.0,
      "ram_percent": 37.7,
      "disk_used_gb": 210.4,
      "disk_total_gb": 800.0,
      "disk_percent": 26.3,
      "gpu": [
        {
          "index": 0,
          "name": "Tesla V100",
          "vram_used_mb": 3759,
          "vram_total_mb": 16160,
          "vram_percent": 23.2,
          "temperature_c": 45,
          "utilization_percent": 12
        }
      ]
    }
    """
    import psutil

    cpu = psutil.cpu_percent(interval=0.5)
    vm  = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    gpu_list = []
    try:
        import pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        for i in range(count):
            h = pynvml.nvmlDeviceGetHandleByIndex(i)
            name  = pynvml.nvmlDeviceGetName(h)
            mem   = pynvml.nvmlDeviceGetMemoryInfo(h)
            temp  = pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU)
            util  = pynvml.nvmlDeviceGetUtilizationRates(h)
            gpu_list.append({
                "index": i,
                "name": name if isinstance(name, str) else name.decode(),
                "vram_used_mb":  mem.used  // (1024 * 1024),
                "vram_total_mb": mem.total // (1024 * 1024),
                "vram_percent":  round(mem.used / mem.total * 100, 1),
                "temperature_c": temp,
                "utilization_percent": util.gpu,
            })
    except Exception:
        pass   # No GPU drivers, or pynvml not installed

    return {
        "cpu_percent":   cpu,
        "ram_used_gb":   round(vm.used  / 1e9, 1),
        "ram_total_gb":  round(vm.total / 1e9, 1),
        "ram_percent":   vm.percent,
        "disk_used_gb":  round(disk.used  / 1e9, 1),
        "disk_total_gb": round(disk.total / 1e9, 1),
        "disk_percent":  round(disk.used / disk.total * 100, 1),
        "gpu": gpu_list,
    }
```

---

## Verify

### Syntax check

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m py_compile api/routes.py api/logger.py && echo OK"
```

### Test endpoints

```bash
curl -s http://localhost:8080/admin/stats/queries | python3 -m json.tool | head -30
curl -s http://localhost:8080/admin/stats/health  | python3 -m json.tool
curl -s http://localhost:8080/admin/stats/resources | python3 -m json.tool
```

### Restart

```bash
sudo systemctl restart ehc-helpdesk
sudo journalctl -u ehc-helpdesk -n 20 --no-pager
```

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git add api/routes.py api/logger.py requirements.txt && git commit -m 'feat: admin stats endpoints — queries, health, resources' && git push origin LOCAL_ASSISTANT"
```
