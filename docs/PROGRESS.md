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

## Next: Phase 1 — Data Layer (Ingestor + Embedder)

Will implement:
- `data/ingestor.py` — fetch all FAQ issues from Redmine API with pagination
- `data/embedder.py` — embed with bge-m3 and store in Qdrant
- `data/reindex.py` — full and incremental reindex scripts
