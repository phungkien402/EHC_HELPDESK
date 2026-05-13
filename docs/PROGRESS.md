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

## Next: Phase 2 — RAG Core Pipeline

Will implement:
- `core/retriever.py` — embed query with bge-m3, search Qdrant
- `core/reranker.py` — cross-encoder rescore with bge-reranker-v2-m3
- `core/query_rewriter.py` — colloquial Vietnamese → formal query via LLM
- `core/generator.py` — vLLM answer generation
- `core/confidence.py` — threshold routing
- `core/pipeline.py` — orchestrate all 5 steps
