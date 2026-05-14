# EHC Helpdesk — Working Agreement

## Project Structure

- `/plan/` — Phase specs (PHASE_0.md through PHASE_5.md) and OVERVIEW.md. Read the relevant phase file before starting any work.
- `/docs/` — Progress reports (PROGRESS.md). Update after each phase.
- `/core/` — RAG pipeline (query_rewriter, retriever, reranker, generator, confidence, fallback, pipeline)
- `/data/` — Data layer (ingestor, embedder, reindex)
- `/adapters/` — Platform adapters (telegram, zalo, web)
- `/api/` — FastAPI routes, session manager, query logger
- `/ui/` — Single-file web chat UI + admin panel
- `/tests/` — Evaluation script and eval set

## How to Run

```bash
# Always use run.sh to execute Python — the server PATH is restricted
bash run.sh data/ingestor.py
bash run.sh -m data.embedder
bash run.sh -m core.pipeline

# Or set PATH explicitly
export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

## Key Technical Decisions

- **No LangChain/LlamaIndex** — plain Python RAG for full control and easy debugging
- **Module-level singletons** — models loaded once at import time (`_model`, `_client`, `_reranker`), never per-request
- **Always embed `subject + description` together** — FAQ descriptions avg 123 chars, too short alone
- **`upsert` not `insert`** — re-running embedder is always safe, no duplicates
- **`recreate=False` by default** in `embed_and_store()` — never accidentally wipe production data
- **Adapter pattern** — `core/` never imports from `adapters/`. Only `api/routes.py` uses adapters.
- **`run.sh`** — workaround for restricted PATH in this shell environment

## Review Workflow

This project is reviewed phase by phase by an external reviewer (via Cowork/Claude Desktop) before proceeding:

1. Implement the phase per the spec in `/plan/`
2. Commit and push to GitHub
3. Reviewer checks the commit and either approves or lists fixes
4. Fix issues, commit, push again
5. Reviewer approves → proceed to next phase

Do not start the next phase until the current phase is approved.

## Commit Convention

```
feat: Phase N - short description
fix: short description of what was fixed
docs: what was updated
```

## Environment

- OS: Ubuntu (Dell R730xd server)
- GPU: 2x Tesla V100 16GB
- Python: `/usr/bin/python3`
- vLLM: `python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-7B-Instruct`
- Qdrant: `docker run -p 6333:6333 qdrant/qdrant`
- Project path: `/home/phungkien/EHC_HELPDESK/ehc-helpdesk/`
