"""
Intent guard:
1. Pre-filter: block dangerous/destructive commands without calling LLM
2. LLM classifier: is query EHC-related? (YES/NO)
3. If NO → LLM chat fallback (short, polite, scoped)

Uses the same synchronous OpenAI client pattern as the rest of the codebase.
"""

import json
import re
import sys
import time
from pathlib import Path
from core.query_rewriter import expand_abbreviations

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI, APIConnectionError

from config import VLLM_BASE_URL, VLLM_MODEL

_DANGEROUS_PATTERNS = re.compile(
    r'\b(xoá|xóa|xoa|delete|drop|rm\s*-rf|format|wipe|destroy|truncate)\b'
    r'.{0,40}'
    r'\b(database|server|data|db|disk|system|table|ổ\s*cứng|máy\s*chủ)\b',
    re.IGNORECASE | re.UNICODE,
)

# Business keyword prior — if query contains any of these, it is almost certainly
# an internal HIS workflow query. Skip LLM classify entirely.
_BUSINESS_KEYWORDS = {
    # Patient & clinical
    "bệnh nhân", "bn", "hồ sơ", "bệnh án",
    # Modules / operations
    "dịch vụ", "viện phí", "thanh toán", "bảng kê",
    "thuốc", "toa thuốc", "kê đơn", "kho thuốc",
    "xét nghiệm", "cls", "cận lâm sàng",
    "cdha", "x-quang", "siêu âm", "pacs",
    "bhyt", "bảo hiểm", "thẻ bhyt",
    "phẫu thuật", "thủ thuật", "pttt",
    "nội trú", "ngoại trú", "nhập viện", "ra viện",
    "phiếu", "in phiếu", "vỏ bệnh án",
    # Common symptom words for HIS errors
    "sai giá", "lỗi giá", "âm kho", "không in được",
    "không tìm thấy", "không lên", "xoay hoài",
    "trắng xóa", "chuyển khoa", "gộp mã",
}


def _load_terminology() -> str:
    """Load terminology from data/terminology.json and format for prompt injection."""
    term_path = Path(__file__).parent.parent / "data" / "terminology.json"
    if not term_path.exists():
        return ""
    try:
        with open(term_path, encoding="utf-8") as f:
            data = json.load(f)
        lines = []
        for section in data.values():
            label = section["label"]
            terms = ", ".join(section["terms"])
            lines.append(f"- {label}: {terms}")
        return "\n".join(lines)
    except Exception:
        return ""


_TERMINOLOGY = _load_terminology()

_client = OpenAI(base_url=f"{VLLM_BASE_URL}/v1", api_key="not-needed")

CLASSIFY_PROMPT = """Bạn là bộ lọc câu hỏi cho hệ thống hỗ trợ nghiệp vụ nội bộ bệnh viện.
Người dùng là nhân viên bệnh viện (bác sĩ, điều dưỡng, dược sĩ, nhân viên đón tiếp, thu ngân).
Họ đang chat với bot hỗ trợ phần mềm EHC — đây là ngữ cảnh mặc định của MỌI câu hỏi.

Vì vậy, người dùng thường KHÔNG đề cập tên phần mềm hay module cụ thể.
Họ hỏi ngắn gọn, dùng jargon nội bộ, ví dụ:
  "sai giá", "không in được", "bị âm kho", "không tìm thấy bệnh nhân"

Thuật ngữ nghiệp vụ thường gặp:
{terminology}

Trả lời YES nếu câu hỏi có thể là nghiệp vụ nội bộ bệnh viện, bao gồm:
- Thao tác phần mềm, lỗi hệ thống, hướng dẫn quy trình
- Câu hỏi về bệnh nhân, thuốc, viện phí, xét nghiệm, BHYT, in phiếu
- Câu ngắn, mơ hồ nhưng nghe có vẻ liên quan đến vận hành bệnh viện
- Khi KHÔNG CHẮC → YES (ưu tiên recall)

Trả lời NO chỉ khi câu hỏi RÕ RÀNG không liên quan:
- Chào hỏi xã giao thuần túy (hello, cảm ơn, tạm biệt)
- Chủ đề hoàn toàn ngoài y tế / phần mềm (thời tiết, giải trí, tin tức)
- Lệnh phá hoại hạ tầng (xoá database, format disk, drop table)

Trả lời CHỈ bằng một từ: YES hoặc NO.
Câu hỏi: "{query}"
"""

CHAT_SYSTEM_PROMPT = """Bạn là trợ lý phần mềm EHC. Luôn trả lời bằng tiếng Việt.
Câu hỏi này nằm ngoài phạm vi hỗ trợ. Trả lời đúng 1 câu ngắn, lịch sự, từ chối và nhắc bạn chỉ hỗ trợ phần mềm EHC.
KHÔNG được trả lời nội dung câu hỏi. PHẢI trả lời bằng tiếng Việt."""

_FALLBACK_RESPONSE = "Xin chào! Mình là trợ lý hỗ trợ phần mềm EHC. Bạn có câu hỏi gì về phần mềm không?"


def classify(query: str) -> bool:
    """Return True if query is off-topic (not EHC-related)."""
    # Pre-filter: block destructive commands without calling LLM
    if _DANGEROUS_PATTERNS.search(query):
        print(f"[INTENT_GUARD] Blocked destructive pattern → OFF-TOPIC: \"{query}\"")
        return True

    # Business keyword prior: skip LLM classify for obvious HIS domain queries
    query_lower = query.lower()
    if any(kw in query_lower for kw in _BUSINESS_KEYWORDS):
        print(f"[INTENT_GUARD] Business keyword match → ON-TOPIC (skip LLM): \"{query}\"")
        return False  # False = on-topic, do not treat as off-topic

    try:
        prompt = CLASSIFY_PROMPT.format(terminology=_TERMINOLOGY, query=expand_abbreviations(query.strip()))

        response = _client.chat.completions.create(
            model=VLLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=5,
            temperature=0.0,
        )
        answer = response.choices[0].message.content.strip().upper()
        print(f"[INTENT_GUARD] Classify: \"{query}\" → {answer}")
        return answer.startswith("NO")

    except APIConnectionError:
        print("[INTENT_GUARD] Classifier connection error, retrying in 1s...")
        time.sleep(1)
        try:
            response = _client.chat.completions.create(
                model=VLLM_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=5,
                temperature=0.0,
            )
            answer = response.choices[0].message.content.strip().upper()
            print(f"[INTENT_GUARD] Classify (retry): \"{query}\" → {answer}")
            return answer.startswith("NO")
        except Exception as e:
            print(f"[INTENT_GUARD] Classifier retry failed: {e} — allowing query through")
            return False

    except Exception as e:
        print(f"[INTENT_GUARD] Classifier failed: {e} — allowing query through")
        return False


def chat_fallback(query: str) -> str:
    """Generate a short, scoped chat response for off-topic queries."""
    try:
        response = _client.chat.completions.create(
            model=VLLM_MODEL,
            messages=[
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": query},
            ],
            max_tokens=150,
            temperature=0.7,
        )
        result = response.choices[0].message.content.strip()
        print(f"[INTENT_GUARD] Chat fallback: \"{result}\"")
        return result

    except APIConnectionError:
        print("[INTENT_GUARD] Chat fallback connection error, retrying in 1s...")
        time.sleep(1)
        try:
            response = _client.chat.completions.create(
                model=VLLM_MODEL,
                messages=[
                    {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                    {"role": "user", "content": query},
                ],
                max_tokens=150,
                temperature=0.7,
            )
            result = response.choices[0].message.content.strip()
            print(f"[INTENT_GUARD] Chat fallback (retry): \"{result}\"")
            return result
        except Exception as e:
            print(f"[INTENT_GUARD] Chat fallback retry failed: {e}")
            return _FALLBACK_RESPONSE

    except Exception as e:
        print(f"[INTENT_GUARD] Chat fallback failed: {e}")
        return _FALLBACK_RESPONSE
