# LOCAL ASSISTANT — Phase 3: Adaptive Shortcut (Skip Rewrite on High-Confidence Queries)

_Branch: LOCAL_ASSISTANT_

## Goal

Reduce latency for high-confidence queries by skipping the analyze+rewrite step (Step 2)
and the full retrieve step (Step 3) when the fast retriever already found a strong match.

Current pipeline: fast retrieve → analyze+rewrite → full retrieve → rerank → generate (5 LLM/embedding calls)
After this change: if `top1.score > HIGH_THRESHOLD`, shortcut to: fast retrieve → rerank → generate (2 LLM calls saved)

This is safe because if the fast retriever returns a very high score hit, the rewrite step
adds noise rather than signal — the query is already precise enough.

## Project path

```
/home/phungkien/EHC_HELPDESK
```

---

## Step 0 — Read source files before making any changes

Use `mcp__code-review-graph` to read each file listed below in full before
touching anything. Do not rely on memory or assume file structure — read first.

Files to read:
- `core/pipeline.py`
- `config.py`

---

## Change 1 — `config.py`

Add a new constant after the existing retriever/reranker constants:

```python
# Adaptive shortcut: skip rewrite + full retrieve when fast retrieval is confident
SHORTCUT_SCORE_THRESHOLD = 0.85
```

---

## Change 2 — `core/pipeline.py`

### 2a. Import the new config constant

Find the existing config imports line (it already imports several constants from config).
Add `SHORTCUT_SCORE_THRESHOLD` to that import.

For example, if the current import looks like:
```python
from config import RETRIEVER_TOP_K, RERANKER_TOP_K, ...
```

Add `SHORTCUT_SCORE_THRESHOLD` to it:
```python
from config import RETRIEVER_TOP_K, RERANKER_TOP_K, ..., SHORTCUT_SCORE_THRESHOLD
```

### 2b. Add shortcut check after Step 1 (fast retrieve)

In the `run()` method (or equivalent pipeline entry point), find the section that performs
**Step 1** (fast retrieve). It will look roughly like:

```python
# Step 1: fast retrieve
fast_chunks = retriever.retrieve(query, top_k=RETRIEVER_TOP_K)
```

Immediately after Step 1, add the shortcut block:

```python
# Adaptive shortcut: if top result is highly confident, skip rewrite + full retrieve
_shortcut = (
    bool(fast_chunks)
    and fast_chunks[0].score >= SHORTCUT_SCORE_THRESHOLD
)
if _shortcut:
    print(
        f"[PIPELINE] Shortcut: top1 score={fast_chunks[0].score:.4f} "
        f">= {SHORTCUT_SCORE_THRESHOLD} — skipping rewrite + full retrieve"
    )
```

### 2c. Wrap Step 2 and Step 3 with the shortcut guard

Step 2 is the analyze+rewrite LLM call. Step 3 is the full retrieve.
Wrap both steps so they are skipped when `_shortcut` is True.

Find the Step 2 block (analyze + rewrite). It will assign something like
`rewritten_query`, `answerable`, or `user_intent`. Wrap it:

```python
if not _shortcut:
    # Step 2: analyze query and rewrite
    # ... existing Step 2 code unchanged ...
    # sets: rewritten_query, answerable, user_intent (or similar variables)
```

After the wrap, initialize fallback values so later steps still have the variables they need:

```python
else:
    # Shortcut path: use original query, skip analysis
    rewritten_query = query
    answerable = "yes"
    user_intent = None
```

> **Important:** look at what variables Step 2 sets and make sure ALL of them get
> initialized in the `else` branch above. Read the existing code carefully first.

Find the Step 3 block (full retrieve using `rewritten_query`). It will assign something like
`chunks` or `full_chunks`. Wrap it:

```python
if not _shortcut:
    # Step 3: full retrieve with rewritten query
    # ... existing Step 3 code unchanged ...
    chunks = retriever.retrieve(rewritten_query, top_k=RETRIEVER_TOP_K)
else:
    # Shortcut path: use fast chunks directly
    chunks = fast_chunks
```

### 2d. Keep Steps 4, 5, 6 unchanged

Steps 4 (rerank), 5 (confidence), and 6 (generate) run on `chunks` regardless of path.
Do NOT modify them.

---

## Verify

### Syntax check

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m py_compile core/pipeline.py && echo OK"
```

### Restart and test

```bash
sudo systemctl restart ehc-helpdesk
sudo journalctl -u ehc-helpdesk -n 30 --no-pager
```

Test queries — check log for `[PIPELINE] Shortcut:` message on exact-match queries:

```
"bác sĩ không kê được đơn thuốc"     ← should shortcut (was top1 ~0.99 before)
"in vỏ bệnh án trắng xóa"             ← may shortcut if FAQ has exact match
"quy trình nhập viện BHYT"            ← should NOT shortcut (low scores → full path)
"gộp mã bệnh nhân"                    ← should NOT shortcut (no direct FAQ match)
```

Expected log pattern for shortcut path:
```
[PIPELINE] Shortcut: top1 score=0.9992 >= 0.85 — skipping rewrite + full retrieve
```

Expected log pattern for full path (no shortcut):
```
[PIPELINE] Query: "quy trình nhập viện BHYT"
[RETRIEVER] ...
[REWRITER] ...
```

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git add core/pipeline.py config.py && git commit -m 'feat: adaptive shortcut — skip rewrite+retrieve when top1 score >= threshold' && git push origin LOCAL_ASSISTANT"
```
