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
