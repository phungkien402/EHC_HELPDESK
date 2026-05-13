# EHC Helpdesk — Progress Report

---

## Phase 0 — Project Scaffold

**Date:** 2026-05-13  
**Status:** ✅ Complete

### What was done

Created the full project directory structure and skeleton files for the EHC AI Helpdesk project. All modules contain docstrings, function/class stubs, and `__main__` blocks for standalone testing.

### Files created

| File | Purpose |
|------|---------|
| `requirements.txt` | All Python dependencies (vllm, sentence-transformers, FlagEmbedding, qdrant-client, fastapi, uvicorn, httpx, python-dotenv, pydantic, loguru, openai) |
| `.env.example` | Template for all required environment variables |
| `.gitignore` | Ignores .env, __pycache__, logs, model cache, IDE files |
| `config.py` | Loads and validates all env vars on import; prints config when run standalone |
| `core/__init__.py` | Package marker |
| `core/models.py` | Shared dataclasses: `Message`, `RetrievedChunk`, `Answer` |
| `core/pipeline.py` | RAG orchestrator stub (5-step pipeline + interactive `__main__`) |
| `core/query_rewriter.py` | LLM-based query normalization stub |
| `core/retriever.py` | Qdrant vector search stub |
| `core/reranker.py` | Cross-encoder reranking stub |
| `core/generator.py` | vLLM answer generation stub |
| `core/confidence.py` | Confidence threshold check (implemented) |
| `core/fallback.py` | Fallback handler stub (3 cases) |
| `data/__init__.py` | Package marker |
| `data/ingestor.py` | Redmine FAQ fetcher stub with `Document` dataclass and `normalize()` |
| `data/embedder.py` | bge-m3 embedding + Qdrant upsert stub |
| `data/reindex.py` | Full/incremental reindex stub |
| `adapters/__init__.py` | Package marker |
| `adapters/base_adapter.py` | Abstract `BaseAdapter` with 3 required methods |
| `adapters/telegram_adapter.py` | Telegram Bot API adapter stub |
| `adapters/zalo_adapter.py` | Zalo OA adapter stub (with signature verification) |
| `adapters/web_adapter.py` | Simple web adapter stub |
| `api/__init__.py` | Package marker |
| `api/routes.py` | FastAPI app with endpoint stubs (/health, /webhook/{platform}, /admin/logs, /admin/reindex) |
| `api/session.py` | In-memory `SessionManager` (fully implemented) |
| `api/logger.py` | `QueryLogger` stub (JSON lines to logs/queries.jsonl) |
| `tests/__init__.py` | Package marker |
| `tests/eval_set.json` | Initial 2-question evaluation set stub |
| `ui/index.html` | Placeholder HTML for Phase 4 |
| `docs/.gitkeep` | Keeps docs/ in git |
| `logs/.gitkeep` | Keeps logs/ in git |

### Verification needed (on server)

- [ ] `pip install -r requirements.txt` completes without errors
- [ ] `python config.py` prints all config values (requires `.env` with at least `REDMINE_URL` and `REDMINE_API_KEY`)
- [ ] All skeleton files can be imported without errors
- [ ] `.env.example` covers all required variables

### Notes

- `core/confidence.py` and `api/session.py` are fully implemented (simple enough to complete now)
- All other modules have `...` as function bodies — to be implemented in subsequent phases
- The project lives at `/home/phungkien/EHC_HELPDESK/ehc-helpdesk/`

---

## Phase 0 — Review Fixes (Round 2)

**Date:** 2026-05-13  
**Status:** ✅ Complete

### What was done

1. **`core/models.py`** — Moved `rewritten_question` field to end of `Answer` dataclass (after `is_fallback`) so default-value ordering is correct.
2. **`api/logger.py`** — Fully implemented `log()` and `read_logs()` methods (no longer stubs). Added proper `__main__` test block.
3. **`data/ingestor.py`** — Fixed `__main__` block to handle `None` return from stub gracefully.
4. **`run.sh`** — Created helper script to work around restricted PATH in dev shell.

### Verification output

```
$ python -m data.ingestor
fetch_all_documents() returned None (stub not yet implemented)
✓ Module imports correctly — implementation pending Phase 1.
```

```
$ python -m api.logger
Logged 1 entries: [{'timestamp': 1778666320.351109, 'user_id': 'test', 'platform': 'web', 'question': 'test question', 'rewritten_question': 'rewritten test question', 'answer': 'test answer', 'confidence': 0.9, 'is_fallback': False, 'top_chunk_subject': ''}]
✓ QueryLogger works correctly.
```

### Notes

- `run.sh` uses `/usr/bin/python3` (Python 3.12.3) with full PATH export — use `/bin/bash run.sh` for all Python commands in this environment.
- `data/ingestor.py` body is still a stub — will be implemented in Phase 1.

---

---

## Phase 1 — Data Layer (Ingestor + Embedder)

**Date:** 2026-05-13  
**Status:** ✅ Complete

### What was done

1. **`data/ingestor.py`** — Fully implemented Redmine FAQ fetcher with pagination, text normalization (arrow separators → `→`), and skip logic for empty/short descriptions.
2. **`data/embedder.py`** — Embeds all documents with bge-m3 (1024-dim), upserts to Qdrant. Added `recreate` parameter to prevent accidental data loss.
3. **`data/reindex.py`** — Full rebuild (`recreate=True`) and incremental diff mode using `.last_index_time` timestamp.

### Pipeline output (`bash run.sh -m data.embedder`)

```
[INGESTOR] Fetching from http://co.ehc.vn:81/redmine/issues.json (project=ehcfaq)
[INGESTOR] Page 1: fetched 100 issues (offset=0)
  [SKIP] id=42709 subject="x" reason="empty description"
  [SKIP] id=19240 subject="x" reason="empty description"
  [SKIP] id=19066 subject="x" reason="empty description"
[INGESTOR] Page 2: fetched 100 issues (offset=100)
  [SKIP] id=18568 subject="x" reason="too short (1 chars)"
[INGESTOR] Page 3: fetched 100 issues (offset=200)
  [SKIP] id=18339 subject="x" reason="empty description"
  [SKIP] id=18244 subject="Cách tắt đi bật lại app nhanh" reason="too short (9 chars)"
[INGESTOR] Page 4: fetched 100 issues (offset=300)
  [SKIP] id=18111 subject="Hướng dẫn cấu hình chữ ký số" reason="empty description"
  [SKIP] id=18086 subject="Cách cập nhật phần mềm" reason="too short (16 chars)"
  [SKIP] id=18056 subject="Cách cập nhật phần mềm" reason="empty description"
  [SKIP] id=18053 subject="Báo cáo mở rộng là gì" reason="empty description"
[INGESTOR] Page 5: fetched 77 issues (offset=400)
  [SKIP] id=17797 subject="Phần mềm cứ xoay mãi" reason="too short (17 chars)"
  [SKIP] id=17791 subject="Không tạo được phiếu tạm ứng,thu tiền ..." reason="too short (16 chars)"
  [SKIP] id=17737 subject="Bác sĩ không kê được đơn thuốc" reason="too short (18 chars)"

[INGESTOR] Done. Total usable: 464, Skipped: 13
[EMBEDDER] Built 464 chunk texts
[EMBEDDER] Loading model: BAAI/bge-m3
[EMBEDDER] Encoding 464 texts (batch_size=32)...
[EMBEDDER] Embeddings shape: (464, 1024)
[EMBEDDER] Collection 'ehc_faq' exists, upserting...
[EMBEDDER] Upserted batch 1: 100 points (total: 100)
[EMBEDDER] Upserted batch 2: 100 points (total: 200)
[EMBEDDER] Upserted batch 3: 100 points (total: 300)
[EMBEDDER] Upserted batch 4: 100 points (total: 400)
[EMBEDDER] Upserted batch 5: 64 points (total: 464)
[EMBEDDER] Done. 464 chunks stored in 'ehc_faq'

Stored 464 chunks in Qdrant collection 'ehc_faq'

--- Sanity Check ---
Test query: 'in bảng kê khám bệnh ở đâu'
  #1 score=0.733 | in bảng kê khám bệnh, chữa bệnh tìm ở đâu
  #2 score=0.676 | In phiếu khám chữa bệnh tìm ở đâu
  #3 score=0.676 | Muốn in sổ khám bệnh ở đâu?
```

### Results

| Metric | Value |
|--------|-------|
| Total issues fetched | 477 (5 pages) |
| Usable documents | 464 |
| Skipped (empty/short) | 13 |
| Chunks stored in Qdrant | 464 |
| Embedding dimension | 1024 (bge-m3) |
| Encoding time | ~26s on CPU |
| Sanity check top score | 0.733 (highly relevant) |

### Review fixes applied

- `embed_and_store(docs, recreate=False)` — safe by default, only drops collection when explicitly asked
- All `sys.path.insert` use relative `Path(__file__).parent.parent` instead of hardcoded absolute path

---

## Phase 2 — RAG Core Pipeline

**Date:** 2026-05-13  
**Status:** ✅ Complete (vLLM-dependent steps degrade gracefully)

### What was done

1. **`core/retriever.py`** — Embeds query with bge-m3, searches Qdrant for Top-K chunks. Lazy-loads model singleton.
2. **`core/reranker.py`** — Cross-encoder rescore with bge-reranker-v2-m3 (FlagReranker). Dramatically improves ranking quality.
3. **`core/confidence.py`** — Already implemented (Phase 0). Threshold check against top reranker score.
4. **`core/fallback.py`** — 3-case handler: ambiguous → clarify, already clarified → escalate, clear but not found → escalate.
5. **`core/query_rewriter.py`** — LLM-based query normalization via vLLM OpenAI API. Falls back to original query if vLLM unavailable.
6. **`core/generator.py`** — vLLM answer generation with strict grounding prompt. Returns error message if vLLM unavailable.
7. **`core/pipeline.py`** — Orchestrates all 5 steps: rewrite → retrieve → rerank → confidence → generate/fallback.

### Test output: `core/retriever.py` ✅

```
Query: "in bảng kê khám bệnh ở đâu"
[RETRIEVER] Top 5 chunks retrieved:
  #1  score=0.733 | in bảng kê khám bệnh, chữa bệnh tìm ở đâu
  #2  score=0.676 | In phiếu khám chữa bệnh tìm ở đâu
  #3  score=0.676 | Muốn in sổ khám bệnh ở đâu?
  #4  score=0.612 | Lấy danh sách bệnh nhân nội trú ở đâu
  #5  score=0.609 | Muốn in báo cáo nhập xuất tồn thuốc toàn viện ở đâu

Query: "xem tồn kho thuốc"
[RETRIEVER] Top 5 chunks retrieved:
  #1  score=0.756 | Xem tồn kho thuốc ở đâu?
  #2  score=0.653 | làm sao để kho ngoại trú vào kiểm tra được bác sỹ vào chiếm kho hay chưa hoàn tất
  #3  score=0.635 | Kiểm kê kho như nào?
```

### Test output: `core/reranker.py` ✅

```
Query: "in bảng kê khám bệnh ở đâu"
[RERANKER] After reranking (top 3):
  #1  score=0.9895 | in bảng kê khám bệnh, chữa bệnh tìm ở đâu
  #2  score=0.9372 | Muốn in sổ khám bệnh ở đâu?
  #3  score=0.8001 | Lấy danh sách bệnh nhân nội trú ở đâu
[RERANKER] Top score: 0.9895  (threshold: 0.4) → CONFIDENT

Query: "cách gộp hồ sơ bệnh nhân trùng"
[RERANKER] After reranking (top 3):
  #1  score=0.6997 | Cách gộp mã bệnh nhân
  #2  score=0.0874 | Cách lưu trữ hồ sơ
  #3  score=0.0400 | Cách chỉ định bệnh nhân khám kết hợp
[RERANKER] Top score: 0.6997  (threshold: 0.4) → CONFIDENT
```

### Test output: `core/fallback.py` ✅

```
[FALLBACK] Case 1: Ambiguous question (1 words) → asking for clarification
[TEST] Input: 'huh??'
[TEST] Response: Bạn có thể mô tả chi tiết hơn vấn đề không?...

[FALLBACK] Case 2: Already clarified, still no match → escalating
[TEST] Response: Vấn đề này chưa có trong tài liệu hướng dẫn hiện tại...

[FALLBACK] Case 3: Clear question but not in FAQ → escalating
[TEST] Response: Vấn đề này chưa có trong tài liệu hướng dẫn hiện tại...
```

### Test output: `core/query_rewriter.py` ⚠️ (vLLM not running)

```
[REWRITER] Original : "merge patient records how?"
[REWRITER] vLLM unavailable (APIConnectionError), using original query
```

Graceful degradation: returns original query when vLLM is unavailable.

### Test output: `core/generator.py` ⚠️ (vLLM not running)

```
[GENERATOR] Context chunks: 1
[GENERATOR] Prompt length: ~190 chars
[GENERATOR] vLLM unavailable (APIConnectionError: Connection error.)
[GENERATOR] Final answer: Lỗi: Không thể kết nối đến LLM server. Vui lòng thử lại sau.
```

### Test output: Full pipeline ✅

```
[PIPELINE] Input: "in bảng kê khám bệnh ở đâu"
[REWRITER] vLLM unavailable, using original query
[RETRIEVER] Top 10 chunks retrieved (top: 0.733)
[RERANKER] After reranking (top 3):
  #1  score=0.9895 | in bảng kê khám bệnh, chữa bệnh tìm ở đâu
[RERANKER] Top score: 0.9895 → CONFIDENT
[GENERATOR] vLLM unavailable
[PIPELINE] Done. confidence=0.9895 fallback=False
```

Pipeline correctly: retrieves → reranks → passes confidence check → attempts generation.
Only vLLM connection is missing (server not started yet).

### Notes

- vLLM server needs to be started for query_rewriter and generator to produce real output
- All other steps (retriever, reranker, confidence, fallback) work independently
- Reranker dramatically improves quality: vector score 0.733 → reranker score 0.9895
- Pipeline gracefully degrades without vLLM — no crashes, clear error messages

---

## Phase 3 — Adapter Layer + FastAPI Gateway

**Date:** 2026-05-13  
**Status:** ✅ Complete

### What was done

1. **`adapters/telegram_adapter.py`** — Full implementation: parses Telegram Update webhooks (text messages only), formats response with confidence footer, sends via Bot API using httpx.
2. **`adapters/zalo_adapter.py`** — Full implementation: parses Zalo OA `user_send_text` events, HMAC-SHA256 signature verification, sends via Zalo OA CS API.
3. **`adapters/web_adapter.py`** — Full implementation: parses simple JSON `{user_id, text}` payloads, no-op send (web uses HTTP response directly).
4. **`api/routes.py`** — Wired everything together: adapter registry, session management, pipeline execution, query logging, background message sending for Telegram/Zalo.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/` | Serve web chat UI |
| POST | `/webhook/{platform}` | Unified webhook (telegram/zalo/web) |
| GET | `/admin/logs` | Query logs (optional `fallback_only` filter) |
| POST | `/admin/reindex` | Trigger full reindex in background |

### Test output

#### Health check ✅

```
$ curl -s http://localhost:8080/health
{"status":"ok","service":"ehc-helpdesk"}
```

#### Webhook (web platform) ✅

```
$ curl -s -X POST http://localhost:8080/webhook/web \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "test_user", "text": "in bảng kê khám bệnh ở đâu"}'

{
  "status": "ok",
  "answer": "Lỗi: Không thể kết nối đến LLM server. Vui lòng thử lại sau.",
  "confidence": 0.9894766451295799,
  "is_fallback": false,
  "rewritten_question": "in bảng kê khám bệnh ở đâu",
  "sources": [
    {"subject": "in bảng kê khám bệnh, chữa bệnh tìm ở đâu", "score": 0.9895, "url": "..."},
    {"subject": "Muốn in sổ khám bệnh ở đâu?", "score": 0.9372, "url": "..."},
    {"subject": "Lấy danh sách bệnh nhân nội trú ở đâu", "score": 0.8001, "url": "..."}
  ]
}
```

Pipeline correctly: retrieves → reranks (0.9895) → passes confidence → attempts generation.
Only vLLM connection is missing (answer text shows error, but pipeline logic is correct).

#### Admin logs ✅

```
$ curl -s http://localhost:8080/admin/logs?limit=5
{"count":1,"logs":[{"timestamp":1778687552.71,"user_id":"test_user","platform":"web",
"question":"in bảng kê khám bệnh ở đâu","rewritten_question":"in bảng kê khám bệnh ở đâu",
"answer":"Lỗi: Không thể kết nối đến LLM server...","confidence":0.989,
"is_fallback":false,"top_chunk_subject":"in bảng kê khám bệnh, chữa bệnh tìm ở đâu"}]}
```

#### Unknown platform → 400 ✅

```
$ curl -s -X POST http://localhost:8080/webhook/unknown -H 'Content-Type: application/json' -d '{}'
{"detail":"Unknown platform: unknown"}
```

#### Server startup log

```
INFO:     Started server process [407075]
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
[RETRIEVER] Loading embedding model: BAAI/bge-m3
[RERANKER] Loading model: BAAI/bge-reranker-v2-m3
```

### Notes

- Models (bge-m3, bge-reranker-v2-m3) load at module import time — first request takes ~15s while models load, subsequent requests are fast
- vLLM not running — query_rewriter falls back to original query, generator returns error message
- CORS enabled for web UI development
- Telegram/Zalo send messages in background tasks (non-blocking)
- Session history stored in memory (resets on server restart)

---

## Next: Phase 4 — Web Chat UI + vLLM Integration
