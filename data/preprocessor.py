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


# ---------------------------------------------------------------------------
# Intent type classification — rule-based keyword matching
# Maps ticket subject/description to a high-level intent category
# ---------------------------------------------------------------------------
INTENT_TYPE_MAP: dict[str, list[str]] = {
    "price_change":      ["sửa giá", "đổi giá", "thay đổi giá", "sai giá", "lệch giá",
                          "chỉnh giá", "đơn giá", "giá dịch vụ", "giá viện phí"],
    "print_form":        ["in phiếu", "in vỏ", "in bảng kê", "in giấy", "in toa",
                          "xuất phiếu", "in lại", "in ấn", "không in được", "trắng xóa"],
    "insurance_switch":  ["đổi đối tượng", "chuyển bhyt", "đổi bhyt", "đổi loại đối tượng",
                          "chuyển đối tượng", "sai đối tượng", "bhyt không đúng"],
    "drug_return":       ["trả thuốc", "hoàn thuốc", "hủy thuốc", "trả lại thuốc",
                          "thuốc đã lĩnh", "trả lại dược"],
    "cancel_service":    ["hủy dịch vụ", "hủy chỉ định", "hủy phiếu", "xóa dịch vụ",
                          "hủy kết quả", "hủy phẫu thuật"],
    "transfer":          ["chuyển khoa", "chuyển viện", "chuyển bệnh nhân",
                          "điều chuyển", "chuyển phòng"],
    "merge_patient":     ["gộp hồ sơ", "gộp mã", "trùng hồ sơ", "bệnh nhân trùng",
                          "gộp bệnh nhân", "trùng mã"],
    "login_error":       ["đăng nhập", "không vào được", "không đăng nhập được",
                          "lỗi đăng nhập", "không login", "bắt update", "bắt cập nhật"],
    "search_lookup":     ["tra cứu", "tìm kiếm", "tìm bệnh nhân", "không tìm thấy",
                          "tìm không ra", "tìm kiếm bệnh nhân"],
    "data_sync":         ["đồng bộ", "không cập nhật", "không hiển thị", "dữ liệu cũ",
                          "chưa lên", "không lên"],
}

# ---------------------------------------------------------------------------
# HIS module classification — rule-based keyword matching
# ---------------------------------------------------------------------------
MODULE_MAP: dict[str, list[str]] = {
    "outpatient":  ["ngoại trú", "khám bệnh", "phòng khám", "tiếp nhận", "đón tiếp",
                    "đặt hẹn", "khám ngoại trú"],
    "inpatient":   ["nội trú", "điều trị", "nhập viện", "ra viện", "bệnh án",
                    "điều dưỡng", "vỏ bệnh án", "hsba"],
    "pharmacy":    ["dược", "thuốc", "kho thuốc", "nhà thuốc", "toa thuốc",
                    "kê đơn", "phát thuốc", "xuất thuốc", "lĩnh thuốc"],
    "laboratory":  ["xét nghiệm", "cận lâm sàng", "cls", "lis", "kết quả xét nghiệm",
                    "phiếu xét nghiệm"],
    "imaging":     ["chẩn đoán hình ảnh", "x-quang", "siêu âm", "cdha", "pacs",
                    "minipacs", "ris", "phim", "kết quả cdha"],
    "billing":     ["viện phí", "thanh toán", "thu ngân", "bảng kê", "thu tiền",
                    "thu phí", "vp", "bảng kê 6556"],
    "insurance":   ["bảo hiểm", "bhyt", "đối tượng bhyt", "bảo hiểm y tế",
                    "thẻ bhyt", "quét thẻ bhyt"],
    "surgery":     ["phẫu thuật", "thủ thuật", "mổ", "pttt", "gây mê",
                    "hồi sức", "phòng mổ"],
    "admin":       ["hành chính", "danh mục", "cấu hình", "hệ thống",
                    "tài liệu tùy biến", "mẫu in", "template", "quản trị"],
    "report":      ["báo cáo", "thống kê", "xuất báo cáo", "in báo cáo"],
}


def infer_intent_type(subject: str, description: str) -> str | None:
    """
    Infer the intent type from subject + description using keyword matching.
    Returns the first matching intent key, or None if no match.
    """
    combined = (subject + " " + description).lower()
    for intent, keywords in INTENT_TYPE_MAP.items():
        for kw in keywords:
            if kw in combined:
                return intent
    return None


def infer_module(subject: str, description: str) -> str | None:
    """
    Infer the HIS module from subject + description using keyword matching.
    Returns the first matching module key, or None if no match.
    """
    combined = (subject + " " + description).lower()
    for module, keywords in MODULE_MAP.items():
        for kw in keywords:
            if kw in combined:
                return module
    return None


def build_aliases(subject: str, description: str) -> list[str]:
    """
    Build a list of domain aliases for the ticket.
    Combines: SYNONYM_MAP matches + abbreviation expansions found in text.
    Returns up to 6 alias strings.
    """
    combined = (subject + " " + description).lower()
    aliases = []

    for key, synonyms in SYNONYM_MAP.items():
        if key in combined:
            for s in synonyms:
                if s not in aliases:
                    aliases.append(s)
        if len(aliases) >= 6:
            break

    for abbr, expanded in ABBREV_MAP.items():
        if re.search(r'\b' + re.escape(abbr) + r'\b', combined):
            if expanded not in aliases:
                aliases.append(expanded)
        if len(aliases) >= 6:
            break

    return aliases[:6]


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
        Câu hỏi: <expanded subject>
        Hướng dẫn: <expanded description>
        INTENT: <intent_type>
        MODULE: <his_module>
        ALIASES: <alias1>, <alias2>, ...
        Từ khóa: <keyword1>, <keyword2>, ...

    This text is NOT shown to users — only used to generate the vector.
    """
    expanded_subject = expand_abbreviations(subject)
    expanded_description = expand_abbreviations(description)
    keywords = extract_keywords(subject, description)
    intent = infer_intent_type(subject, description)
    module = infer_module(subject, description)
    aliases = build_aliases(subject, description)

    lines = [
        f"Câu hỏi: {expanded_subject}",
        f"Hướng dẫn: {expanded_description}",
    ]
    if intent:
        lines.append(f"INTENT: {intent}")
    if module:
        lines.append(f"MODULE: {module}")
    if aliases:
        lines.append(f"ALIASES: {', '.join(aliases)}")
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
