# IMPROVE: Add clarify mechanism + session history to pipeline

_Generated: 2026-05-23 | Project: EHC_HELPDESK_

## Context

Current pipeline answers immediately for vague queries like "mình không in được".
Two related improvements:
1. `analyze_and_rewrite` gains an ANSWERABLE field to detect vague queries
2. `pipeline.run()` checks ANSWERABLE — if "unclear" → return clarify message instead of proceeding
3. `analyze_and_rewrite` receives session_history to resolve follow-up messages ("1", "cái đó", "vậy thì...")

## Project path

```
/home/phungkien/EHC_HELPDESK
```

---

## Change 1 — `core/query_rewriter.py`

### 1a. Update `ANALYZE_AND_REWRITE_PROMPT`

Replace the existing `ANALYZE_AND_REWRITE_PROMPT` constant with:

```python
ANALYZE_AND_REWRITE_PROMPT = (
    "Bạn là trợ lý EHC. Dựa vào tài liệu tham khảo (nếu có), hãy thực hiện 3 việc:\n"
    "1. Mô tả ngắn gọn vấn đề người dùng đang gặp (1 câu, ngôi thứ 3)\n"
    "2. Viết lại câu hỏi thành query tìm kiếm ngắn gọn, formal tiếng Việt\n"
    "3. Đánh giá xem câu hỏi có đủ thông tin để trả lời không\n"
    "Trả về đúng 3 dòng theo format:\n"
    "INTENT: <mô tả vấn đề>\n"
    "QUERY: <query tìm kiếm>\n"
    "ANSWERABLE: <yes | no | unclear>\n\n"
    "Hướng dẫn cho ANSWERABLE:\n"
    "- yes: câu hỏi đủ thông tin, có thể tìm kiếm và trả lời\n"
    "- unclear: câu hỏi quá mơ hồ — không đề cập module nào, lỗi gì, thao tác nào, "
    "hoặc loại tài liệu nào. Ví dụ: 'mình không in được', 'bị lỗi rồi', 'không vào được'\n"
    "- no: hoàn toàn không liên quan hoặc không có tài liệu tham khảo\n\n"
    "Nếu lịch sử hội thoại đã làm rõ vấn đề → ANSWERABLE=yes dù câu hỏi hiện tại ngắn.\n"
    "Nếu không có tài liệu tham khảo nhưng câu hỏi rõ ràng → ANSWERABLE=yes."
)
```

### 1b. Update `_parse_intent_and_query()` — rename to `_parse_analyze_response()`

Replace the existing `_parse_intent_and_query` function with:

```python
def _parse_analyze_response(response_text: str, original_query: str) -> tuple[str | None, str, str]:
    """Parse INTENT/QUERY/ANSWERABLE response. Returns (intent, rewritten_query, answerable)."""
    intent = None
    rewritten = original_query
    answerable = "unclear"  # safe default

    for line in response_text.strip().splitlines():
        line = line.strip()
        if line.upper().startswith("INTENT:"):
            intent = line[len("INTENT:"):].strip()
        elif line.upper().startswith("QUERY:"):
            rewritten = line[len("QUERY:"):].strip()
        elif line.upper().startswith("ANSWERABLE:"):
            val = line[len("ANSWERABLE:"):].strip().lower()
            if val in ("yes", "no", "unclear"):
                answerable = val

    if not rewritten:
        rewritten = original_query

    return intent, rewritten, answerable
```

### 1c. Update `analyze_and_rewrite()` — add session_history + return answerable

Replace the existing `analyze_and_rewrite` function signature and body:

```python
def analyze_and_rewrite(query: str, chunks: list = None, session_history: list = None) -> tuple[str | None, str, str]:
    """
    Combined intent analysis + query rewrite + answerability check in a single vLLM call.
    Returns (intent, rewritten_query, answerable).

    answerable is one of: "yes", "no", "unclear"
    If chunks are provided, injects them as context for grounded analysis.
    If session_history is provided, injects recent turns so LLM can resolve
    short follow-up replies (e.g. "2", "cái đó", "vậy thì...") in context.
    Graceful degradation: returns (None, original_query, "unclear") if vLLM is unavailable.
    """
    query = expand_abbreviations(query)
    print(f"[ANALYZE+REWRITE] Query: \"{query}\"")

    # Build history block from recent conversation turns (last 2 exchanges = 4 messages)
    history_block = ""
    if session_history:
        recent = session_history[-4:]
        lines = []
        for turn in recent:
            role = "Người dùng" if turn["role"] == "user" else "Trợ lý"
            lines.append(f"{role}: {turn['text']}")
        history_block = "Lịch sử hội thoại:\n" + "\n".join(lines) + "\n\n"
        print(f"[ANALYZE+REWRITE] Injecting {len(recent)} history turns")

    # Build user content with optional chunk context
    if chunks:
        print(f"[ANALYZE+REWRITE] Using {len(chunks)} chunks as context")
        chunk_texts = []
        for i, c in enumerate(chunks, 1):
            subject = c.metadata.get("subject", "")
            text = c.text or c.metadata.get("description", "")
            chunk_texts.append(f"{i}. {subject}: {text}")
        context_block = "\n".join(chunk_texts)
        user_content = f"{history_block}Tài liệu tham khảo:\n{context_block}\n\nCâu hỏi: {query}"
    else:
        print(f"[ANALYZE+REWRITE] No chunks (blind mode)")
        user_content = f"{history_block}Câu hỏi: {query}"

    messages = [
        {"role": "system", "content": ANALYZE_AND_REWRITE_PROMPT},
        {"role": "user", "content": user_content},
    ]

    try:
        response = _client.chat.completions.create(
            model=VLLM_MODEL,
            messages=messages,
            max_tokens=200,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
        intent, rewritten, answerable = _parse_analyze_response(raw, query)
        print(f"[ANALYZE+REWRITE] Intent: \"{intent}\"")
        print(f"[ANALYZE+REWRITE] Rewritten: \"{rewritten}\"")
        print(f"[ANALYZE+REWRITE] Answerable: \"{answerable}\"")
        return intent, rewritten, answerable

    except APIConnectionError:
        print(f"[ANALYZE+REWRITE] Connection error, retrying in 1s...")
        time.sleep(1)
        try:
            response = _client.chat.completions.create(
                model=VLLM_MODEL,
                messages=messages,
                max_tokens=200,
                temperature=0.1,
            )
            raw = response.choices[0].message.content.strip()
            intent, rewritten, answerable = _parse_analyze_response(raw, query)
            print(f"[ANALYZE+REWRITE] Intent (retry): \"{intent}\"")
            print(f"[ANALYZE+REWRITE] Rewritten (retry): \"{rewritten}\"")
            print(f"[ANALYZE+REWRITE] Answerable (retry): \"{answerable}\"")
            return intent, rewritten, answerable
        except Exception as retry_e:
            print(f"[ANALYZE+REWRITE] Retry failed ({type(retry_e).__name__}), raising LLMUnavailableError")
            raise LLMUnavailableError(str(retry_e)) from retry_e

    except Exception as e:
        print(f"[ANALYZE+REWRITE] vLLM unavailable ({type(e).__name__}), raising LLMUnavailableError")
        raise LLMUnavailableError(str(e)) from e
```

---

## Change 2 — `core/pipeline.py`

### 2a. Update Step 2 call — unpack 3 values + pass session_history

Find the existing Step 2 block and replace:

```python
    # Step 2: Analyze intent + rewrite query in a single LLM call
    print(f"\n[PIPELINE] Step 2: Analyze + Rewrite (single call)")
    try:
        if fast_chunks:
            user_intent, rewritten = analyze_and_rewrite(message.text, chunks=fast_chunks)
        else:
            user_intent, rewritten = analyze_and_rewrite(message.text)
    except LLMUnavailableError:
```

Replace with:

```python
    # Step 2: Analyze intent + rewrite query + answerability check in a single LLM call
    print(f"\n[PIPELINE] Step 2: Analyze + Rewrite (single call)")
    try:
        if fast_chunks:
            user_intent, rewritten, answerable = analyze_and_rewrite(
                message.text, chunks=fast_chunks, session_history=session_history
            )
        else:
            user_intent, rewritten, answerable = analyze_and_rewrite(
                message.text, session_history=session_history
            )
    except LLMUnavailableError:
```

### 2b. Add clarify check after Step 2 — insert BEFORE Step 3

After the Step 2 block (after `print(f"[PIPELINE] analyze_and_rewrite: ...")`), add:

```python
    # Step 2.5: Clarify if query is too vague
    if answerable == "unclear":
        print(f"[PIPELINE] Query too vague (answerable=unclear) → clarify")
        clarify_text = _build_clarify_message(message.text, user_intent)
        return Answer(
            text=clarify_text,
            confidence=0.0,
            source_chunks=[],
            is_fallback=True,
            rewritten_question=rewritten,
        )
```

### 2c. Add `_build_clarify_message()` helper — insert before `run()` function

```python
def _build_clarify_message(query: str, intent: str | None) -> str:
    """
    Build a clarify message asking for more details.
    Uses a simple LLM call to generate a natural follow-up question.
    Falls back to a generic message if vLLM is unavailable.
    """
    from config import VLLM_BASE_URL, VLLM_MODEL
    from openai import OpenAI, APIConnectionError as _APIConnectionError

    _CLARIFY_PROMPT = (
        "Bạn là trợ lý hỗ trợ phần mềm EHC. Người dùng gửi tin nhắn mơ hồ.\n"
        "Hãy hỏi ngắn gọn (tối đa 2 câu) để làm rõ vấn đề.\n"
        "Chỉ hỏi dựa trên những gì user đã nói — KHÔNG giả định module cụ thể.\n"
        "Hỏi cụ thể: lỗi gì? module nào? thao tác nào? thấy thông báo gì?"
    )
    _DEFAULT = "Bạn đang gặp vấn đề cụ thể nào? Thấy thông báo lỗi gì không?"

    try:
        _c = OpenAI(base_url=f"{VLLM_BASE_URL}/v1", api_key="not-needed")
        resp = _c.chat.completions.create(
            model=VLLM_MODEL,
            messages=[
                {"role": "system", "content": _CLARIFY_PROMPT},
                {"role": "user", "content": query},
            ],
            max_tokens=100,
            temperature=0.3,
        )
        msg = resp.choices[0].message.content
        if msg:
            return msg.strip()
    except Exception:
        pass
    return _DEFAULT
```

### 2d. Update import at top of `core/pipeline.py`

The existing import already has `analyze_and_rewrite` — no change needed.
But verify the import line reads:
```python
from core.query_rewriter import analyze_and_rewrite
```

---

## Verify

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m py_compile core/query_rewriter.py core/pipeline.py && echo OK"
```

```bash
/bin/bash /home/phungkien/EHC_HELPDESK/run.sh -c "
from core.query_rewriter import analyze_and_rewrite
tests = [
    'mình không in được',
    'ấn in vỏ bệnh án thì trắng xóa',
    'tạo tài liệu tùy biến như nào',
    'quét thẻ BHYT báo không tìm thấy bệnh nhân',
]
for q in tests:
    intent, rewritten, answerable = analyze_and_rewrite(q)
    print(f'[{answerable}] {q!r} → {rewritten!r}')
"
```

Expected:
```
[unclear] 'mình không in được' → 'Lỗi không in được'
[yes]     'ấn in vỏ bệnh án thì trắng xóa' → 'Lỗi in vỏ bệnh án hiển thị trắng xóa'
[yes]     'tạo tài liệu tùy biến như nào' → 'Cách tạo tài liệu tùy biến'
[yes]     'quét thẻ BHYT báo không tìm thấy bệnh nhân' → 'Lỗi quét thẻ BHYT không tìm thấy bệnh nhân'
```

Restart service:
```bash
sudo systemctl restart ehc-helpdesk
sudo journalctl -u ehc-helpdesk -n 30
```

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git checkout -b improve/clarify-pipeline && git add core/query_rewriter.py core/pipeline.py && git commit -m 'improve: add clarify mechanism and session history to pipeline' && git push origin improve/clarify-pipeline"
```

## Notes
- Apply `EHC_IMPROVE_INTENTGUARD.md` first before this file
- `_build_clarify_message` uses a separate OpenAI client — acceptable for now, can refactor later
- If vLLM is down during clarify generation, falls back to a generic message (no crash)
- `answerable="no"` still proceeds to retrieval — the confidence check + fallback handles it downstream
