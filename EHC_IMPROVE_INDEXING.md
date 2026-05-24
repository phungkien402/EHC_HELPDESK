# IMPROVE: RAG Index Quality — Preprocessing + Keyword Augmentation

_Generated: 2026-05-24 | Project: EHC_HELPDESK_

## Context

Current `data/embedder.py` embeds raw `subject + description` directly.
Problems:
- Abbreviations in tickets ("CLS", "XN", "CDHA") don't match user queries ("cận lâm sàng", "xét nghiệm")
- No synonym coverage — "phiếu CLS" ≠ "phiếu xét nghiệm" in vector space
- Metadata fields (status, priority, assignee) pollute embedding if ever included

Two changes:
1. New `data/preprocessor.py` — build enriched `embedding_text` at index time
2. Update `data/embedder.py` — embed `embedding_text`, keep `raw_text` for display

## Project path

```
/home/phungkien/EHC_HELPDESK/ehc-helpdesk
```

Shell pattern:
```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK/ehc-helpdesk && <command>"
```

---

## Change 1 — Create `data/preprocessor.py`

Create new file `/home/phungkien/EHC_HELPDESK/ehc-helpdesk/data/preprocessor.py`:

```python
"""
Index-time preprocessing for EHC RAG.

Converts a raw Document into enriched embedding_text by:
1. Expanding medical abbreviations (CLS → cận lâm sàng)
2. Extracting keywords present in the text from terminology.json
3. Adding synonym aliases for common abbreviations

embedding_text is used ONLY for generating the vector — never shown to users.
raw_text (original subject + description) is stored separately for display.
"""

import json
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Abbreviation map — expand at index time so vectors match expanded queries
# ---------------------------------------------------------------------------
ABBREV_MAP = {
    "cls": "cận lâm sàng",
    "xn": "xét nghiệm",
    "cdha": "chẩn đoán hình ảnh",
    "pacs": "chẩn đoán hình ảnh lưu trữ",
    "lis": "hệ thống thông tin xét nghiệm",
    "ris": "hệ thống thông tin X-quang",
    "his": "hệ thống thông tin bệnh viện",
    "emr": "hồ sơ bệnh án điện tử",
    "bhyt": "bảo hiểm y tế",
    "dvkt": "dịch vụ kỹ thuật",
    "kb": "khám bệnh",
    "nt": "nội trú",
    "nt": "ngoại trú",
    "bn": "bệnh nhân",
    "bs": "bác sĩ",
    "dd": "điều dưỡng",
    "ds": "dược sĩ",
    "ktv": "kỹ thuật viên",
    "vp": "viện phí",
    "ba": "bệnh án",
    "pttt": "phẫu thuật thủ thuật",
    "hsba": "hồ sơ bệnh án",
    "pk": "phòng khám",
    "cc": "cấp cứu",
}

# Aliases: if ticket mentions key → also add value as keyword
SYNONYM_MAP = {
    "cận lâm sàng": ["xét nghiệm", "cls", "phiếu cls"],
    "xét nghiệm": ["cận lâm sàng", "cls"],
    "chẩn đoán hình ảnh": ["x-quang", "siêu âm", "cdha", "pacs"],
    "in phiếu": ["xuất phiếu", "in ấn", "print"],
    "bảo hiểm y tế": ["bhyt", "bảo hiểm"],
    "bệnh án": ["hsba", "hồ sơ bệnh án", "ba"],
    "viện phí": ["thanh toán", "thu ngân", "vp"],
    "phẫu thuật": ["mổ", "pttt", "thủ thuật"],
    "điều trị": ["nội trú", "nt"],
    "tài liệu tùy biến": ["vỏ bệnh án", "mẫu in", "template"],
    "giấy ra viện": ["phiếu xuất viện", "giấy xuất viện"],
    "phiếu chỉ định": ["phiếu hướng dẫn", "phiếu cls", "chỉ định cận lâm sàng"],
}


def _load_terminology_terms() -> list[str]:
    """Load all terms from data/terminology.json for keyword extraction."""
    term_path = Path(__file__).parent.parent / "data" / "terminology.json"
    if not term_path.exists():
        return []
    try:
        with open(term_path, encoding="utf-8") as f:
            data = json.load(f)
        terms = []
        for section in data.values():
            terms.extend(section.get("terms", []))
        # Sort longest first so multi-word terms are matched before substrings
        return sorted(set(terms), key=len, reverse=True)
    except Exception:
        return []


_TERMINOLOGY_TERMS = _load_terminology_terms()


def expand_abbreviations(text: str) -> str:
    """
    Expand known abbreviations in text.
    Word-boundary aware: only expands standalone abbreviations.
    E.g. "CLS" → "cận lâm sàng", "in CLS" → "in cận lâm sàng"
    """
    text_lower = text.lower()
    result = text_lower
    for abbr, expanded in ABBREV_MAP.items():
        pattern = r'\b' + re.escape(abbr) + r'\b'
        result = re.sub(pattern, expanded, result, flags=re.IGNORECASE)
    return result


def extract_keywords(subject: str, description: str) -> list[str]:
    """
    Extract keywords from subject + description by matching against:
    1. terminology.json terms
    2. ABBREV_MAP values (expanded forms)
    3. SYNONYM_MAP keys

    Returns deduplicated list, max 8 keywords.
    """
    combined = (subject + " " + description).lower()
    keywords = []

    # Match against terminology terms
    for term in _TERMINOLOGY_TERMS:
        if term.lower() in combined and term not in keywords:
            keywords.append(term.lower())
        if len(keywords) >= 6:
            break

    # Add abbreviation expansions found in text
    for abbr, expanded in ABBREV_MAP.items():
        if re.search(r'\b' + re.escape(abbr) + r'\b', combined):
            if expanded not in keywords:
                keywords.append(expanded)
        if len(keywords) >= 8:
            break

    # Add synonyms for matched keywords
    extra = []
    for kw in keywords[:]:
        for synonyms in SYNONYM_MAP.get(kw, []):
            if synonyms not in keywords and synonyms not in extra:
                extra.append(synonyms)

    keywords.extend(extra[:3])  # cap synonym expansion
    return list(dict.fromkeys(keywords))[:8]  # deduplicate, max 8


def build_embedding_text(subject: str, description: str) -> str:
    """
    Build enriched text for embedding.
    Structure:
        Câu hỏi: <subject expanded>
        Hướng dẫn: <description expanded>
        Từ khóa: <keyword1>, <keyword2>, ...

    This text is NOT shown to users — only used to generate the vector.
    """
    expanded_subject = expand_abbreviations(subject)
    expanded_description = expand_abbreviations(description)
    keywords = extract_keywords(subject, description)

    lines = [
        f"Câu hỏi: {expanded_subject}",
        f"Hướng dẫn: {expanded_description}",
    ]
    if keywords:
        lines.append(f"Từ khóa: {', '.join(keywords)}")

    return "\n".join(lines)


def build_raw_text(subject: str, description: str) -> str:
    """
    Original text for display — no expansion, exactly as in Redmine.
    """
    return f"Câu hỏi: {subject}\nHướng dẫn: {description}"


# ---------------------------------------------------------------------------
# Standalone test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    test_cases = [
        (
            "in phiếu hướng dẫn thực hiện cận lâm sàng",
            "vào module khám bệnh, chọn chức năng in, tìm phiếu hướng dẫn thực hiện CLS",
        ),
        (
            "quét thẻ BHYT báo không tìm thấy bệnh nhân",
            "kiểm tra lại số BHYT, vào module KB → tiếp nhận → tra cứu BHYT",
        ),
        (
            "in vỏ bệnh án trắng xóa",
            "vào module nội trú → tài liệu tùy biến → in BA → chọn mẫu vỏ BA",
        ),
    ]

    for subject, description in test_cases:
        print(f"\n{'='*60}")
        print(f"SUBJECT    : {subject}")
        print(f"DESCRIPTION: {description}")
        print(f"\n--- RAW TEXT ---")
        print(build_raw_text(subject, description))
        print(f"\n--- EMBEDDING TEXT ---")
        print(build_embedding_text(subject, description))
```

---

## Change 2 — Update `data/embedder.py`

### 2a. Add import at top of `data/embedder.py`

After existing imports, add:

```python
from data.preprocessor import build_embedding_text, build_raw_text
```

### 2b. Replace `build_chunk_text()` usage

Find the existing function:

```python
def build_chunk_text(doc: Document) -> str:
    return (
        f"Câu hỏi: {doc.subject}\n"
        f"Hướng dẫn: {doc.description}"
    )
```

Replace the call site (inside the embedding loop) with:

```python
# Build two versions: embedding_text for vector, raw_text for display
embedding_texts = [
    build_embedding_text(doc.subject, doc.description)
    for doc in docs_to_embed
]
raw_texts = [
    build_raw_text(doc.subject, doc.description)
    for doc in docs_to_embed
]
```

Then pass `embedding_texts` to the embedding model:

```python
# Replace:
embeddings = model.encode(chunk_texts, batch_size=32, show_progress_bar=True)

# With:
embeddings = model.encode(embedding_texts, batch_size=32, show_progress_bar=True)
```

### 2c. Update Qdrant payload — add both text fields

In the `PointStruct` payload, replace the existing `chunk_text` field with both versions:

```python
PointStruct(
    id=doc.issue_id,
    vector=embedding,
    payload={
        "issue_id": doc.issue_id,
        "subject": doc.subject,
        "description": doc.description,
        "project": doc.project,
        "url": doc.url,
        "chunk_text": raw_text,            # display text — shown to users
        "embedding_text": embedding_text,  # enriched text — used for vector only
    }
)
```

Where `raw_text` and `embedding_text` come from zipping the lists built in 2b.

Full upsert loop after the change:

```python
client.upsert(
    collection_name=QDRANT_COLLECTION,
    points=[
        PointStruct(
            id=doc.issue_id,
            vector=embedding.tolist(),
            payload={
                "issue_id": doc.issue_id,
                "subject": doc.subject,
                "description": doc.description,
                "project": doc.project,
                "url": doc.url,
                "chunk_text": raw_text,
                "embedding_text": embedding_text,
            }
        )
        for doc, embedding, raw_text, embedding_text
        in zip(docs_to_embed, embeddings, raw_texts, embedding_texts)
    ]
)
```

---

## Verify

### Step 1 — Syntax check

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK/ehc-helpdesk && python3 -m py_compile data/preprocessor.py data/embedder.py && echo OK"
```

### Step 2 — Test preprocessor standalone

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK/ehc-helpdesk && python3 -m data.preprocessor"
```

Expected output for first test case:
```
--- RAW TEXT ---
Câu hỏi: in phiếu hướng dẫn thực hiện cận lâm sàng
Hướng dẫn: vào module khám bệnh, chọn chức năng in, tìm phiếu hướng dẫn thực hiện CLS

--- EMBEDDING TEXT ---
Câu hỏi: in phiếu hướng dẫn thực hiện cận lâm sàng
Hướng dẫn: vào module khám bệnh, chọn chức năng in, tìm phiếu hướng dẫn thực hiện cận lâm sàng
Từ khóa: khám bệnh, in, cận lâm sàng, phiếu hướng dẫn, xét nghiệm, phiếu cls
```

### Step 3 — Reindex

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK/ehc-helpdesk && python3 -m data.embedder"
```

Watch for:
- No import errors
- Embedding count matches previous (should be ~455)
- No crash in upsert loop

### Step 4 — Spot check a few vectors

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK/ehc-helpdesk && python3 -c \"
from qdrant_client import QdrantClient
from config import QDRANT_URL, QDRANT_COLLECTION
c = QdrantClient(url=QDRANT_URL)
pts = c.scroll(collection_name=QDRANT_COLLECTION, limit=3, with_payload=True, with_vectors=False)[0]
for p in pts:
    print('---')
    print('chunk_text    :', p.payload.get('chunk_text', '')[:80])
    print('embedding_text:', p.payload.get('embedding_text', '')[:120])
\""
```

Confirm `embedding_text` is present and longer than `chunk_text` (due to keyword expansion).

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK/ehc-helpdesk && git checkout -b improve/indexing-preprocess && git add data/preprocessor.py data/embedder.py && git commit -m 'improve: add index-time preprocessing with abbreviation expansion and keyword augmentation' && git push origin improve/indexing-preprocess"
```

---

## Notes

- `embedding_text` enriches the vector but is NOT shown in the bot's answer — users always see `chunk_text` (raw_text)
- `ABBREV_MAP` in preprocessor.py intentionally overlaps with `expand_abbreviations()` in `query_rewriter.py` — both sides (index + query) should expand for best recall. Can refactor to shared `core/abbrev.py` later.
- `extract_keywords()` caps at 8 keywords — more than that hurts embedding quality (dilutes signal)
- Run `python3 -m data.embedder` to reindex after applying — takes ~2 min on CPU for 455 docs
- Apply this before `EHC_IMPROVE_CLARIFY.md` — better index quality makes clarify less necessary
