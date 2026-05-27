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

CLASSIFY_PROMPT = """Bạn là bộ phân loại câu hỏi hỗ trợ phần mềm quản lý bệnh viện EHC (Ehealthcare Vietnam).
Phần mềm EHC là hệ thống HIS/EMR dùng tại các bệnh viện Việt Nam, bao gồm các phân hệ:
Đón tiếp, Khám bệnh, Điều trị nội trú, Dược/Kho thuốc, Xét nghiệm, Chẩn đoán hình ảnh (CĐHA/PACS/MiniPACS), Phẫu thuật thủ thuật, Thanh toán/Viện phí/BHYT, Hành chính bệnh nhân, Báo cáo thống kê, Danh mục hệ thống.
Người dùng là nhân viên bệnh viện: bác sĩ, điều dưỡng, dược sĩ, nhân viên đón tiếp, thu ngân, kỹ thuật viên xét nghiệm, nhân viên CĐHA, quản trị viên.

Thuật ngữ và cách diễn đạt thường gặp:
{terminology}

Câu hỏi liên quan (YES): thao tác nghiệp vụ bệnh viện, quy trình khám chữa bệnh, lỗi phần mềm, hướng dẫn sử dụng tính năng, quản lý bệnh nhân, thuốc, viện phí, báo cáo, cấu hình hệ thống.
Câu hỏi KHÔNG liên quan (NO):
- Chào hỏi xã giao thuần túy (hello, xin chào, cảm ơn, tạm biệt)
- Hoàn toàn không liên quan đến y tế hoặc phần mềm EHC
- Lệnh phá hoại: xoá database, drop table, format disk, rm -rf, destroy server
- Quản trị hạ tầng không liên quan vận hành EHC: restart OS, thay đổi firewall, cài đặt OS
Khi không chắc chắn → YES.
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
