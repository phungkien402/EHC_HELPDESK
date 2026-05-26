# LOCAL ASSISTANT — Phase 1: System Prompt Rewrite

_Branch: LOCAL_ASSISTANT_

## Goal

Rewrite the generator system prompt so Qwen behaves like a senior EHC support
specialist — reasons over retrieved docs, synthesizes across chunks, and answers
naturally from domain expertise. Current prompt is too restrictive ("answer ONLY
from context") which makes the bot behave like a search engine.

## Project path

```
/home/phungkien/EHC_HELPDESK
```

---

## Step 0 — Read source files before making any changes

Use `mcp__code-review-graph` to read each file listed below in full before
touching anything. Do not rely on memory or assume file structure — read first.

Files to read:
- `core/generator.py`
- `core/pipeline.py`
- `core/models.py`
- `config.py`

For each file: understand the current implementation, locate the exact functions
and constants that need to change, then apply the changes described below.

---

## Change 1 — `core/generator.py`

### 1a. Replace `SYSTEM_PROMPT`

Find the existing `SYSTEM_PROMPT` constant and replace it entirely with:

```python
SYSTEM_PROMPT = (
    "You are an expert support specialist for EHC (Ehealthcare Vietnam) — "
    "a HIS/EMR system deployed at hospitals across Vietnam. "
    "You have deep knowledge of the entire system: patient registration, "
    "outpatient/inpatient treatment, pharmacy/drug inventory, lab tests, "
    "medical imaging (CDHA/PACS), surgery, billing/insurance (BHYT), "
    "and reporting.\n\n"
    "Users are doctors, nurses, pharmacists, receptionists, and cashiers "
    "who need help with software tasks.\n\n"
    "How to answer:\n"
    "1. Use the REFERENCE DOCUMENTS below as your primary source. "
    "Prioritize information found there.\n"
    "2. You are allowed to reason, interpret, and connect information across "
    "documents. If the answer can be logically inferred from the context and "
    "your EHC domain knowledge, answer naturally — no need to qualify with "
    "'according to the document'.\n"
    "3. If the question is about EHC but the documents are insufficient, "
    "use your domain knowledge to answer and add: "
    "'Nếu cách này chưa đúng với phiên bản của bạn, liên hệ thêm nhé.'\n"
    "4. For multi-step guidance (3+ steps), use a numbered list. "
    "For 1-2 steps, write as a natural sentence.\n"
    "5. Reply in Vietnamese. Use 'mình' or no subject pronoun, address user as 'bạn'.\n"
    "6. Friendly tone like a helpful colleague — not formal, "
    "do not open with 'Để... bạn hãy thực hiện theo các bước sau:'.\n"
    "7. Vary your openings naturally. "
    "End with: 'Nếu vẫn gặp khó khăn, bạn có thể liên hệ thêm nhé!'\n"
    "8. Do NOT fabricate specific menu names or navigation paths you are not "
    "sure about. If uncertain about an exact path, say so rather than guess wrong."
)
```

### 1b. Replace `_build_user_prompt()`

Find the existing `_build_user_prompt` function and replace it entirely:

```python
def _build_user_prompt(
    query: str,
    chunks: list[RetrievedChunk],
    history: list[dict] = None,
    user_intent: str = None,
) -> str:
    """Build the user prompt with reference docs, conversation history, and question."""
    parts = []

    if user_intent:
        parts.append(f"[User issue: {user_intent}]\n")

    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        subject = chunk.metadata.get("subject", "") if chunk.metadata else ""
        label = f"[Document {i}]" + (f" — {subject}" if subject else "")
        context_parts.append(f"{label}\n{chunk.text}")

    context = "\n\n---\n\n".join(context_parts)
    parts.append(f"REFERENCE DOCUMENTS:\n{context}")

    if history:
        recent = history[-4:]
        history_lines = []
        for turn in recent:
            role = "User" if turn["role"] == "user" else "Assistant"
            history_lines.append(f"{role}: {turn['text']}")
        parts.append("\nCONVERSATION HISTORY:\n" + "\n".join(history_lines))

    parts.append(f"\n---\n\nQUESTION: {query}")

    return "\n".join(parts)
```

### 1c. Increase `max_tokens` and `temperature`

In `generate()`, find both LLM call sites (primary call and the APIConnectionError
retry) and update:

```python
# FROM:
max_tokens=512,
temperature=0.1,

# TO:
max_tokens=800,
temperature=0.3,
```

Apply to BOTH call sites.

---

## Verify

### Syntax check

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m py_compile core/generator.py && echo OK"
```

### Standalone test

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m core.generator"
```

### Restart service

```bash
sudo systemctl restart ehc-helpdesk
sudo journalctl -u ehc-helpdesk -n 20 --no-pager
```

### Test via bot

```
1. "bác sĩ không kê được đơn thuốc"
2. "in vỏ bệnh án trắng xóa"
3. "quét thẻ BHYT báo không tìm thấy"
4. "mình không in được"
```

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git checkout LOCAL_ASSISTANT && git add core/generator.py && git commit -m 'feat: rewrite generator system prompt — EHC expert identity, allow reasoning' && git push origin LOCAL_ASSISTANT"
```
