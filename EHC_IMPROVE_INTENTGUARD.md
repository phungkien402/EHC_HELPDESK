# IMPROVE: Upgrade IntentGuard — terminology injection + dangerous pattern blocking

_Generated: 2026-05-23 | Project: EHC_HELPDESK_

## Context

Current `core/intent_guard.py` uses a generic CLASSIFY_PROMPT with no domain knowledge.
This causes misclassification of EHC-specific terms (bệnh án, BHYT, xử trí...).
Also missing: dangerous pattern blocking before LLM call.

## Project path

```
/home/phungkien/EHC_HELPDESK/
```

Shell pattern for all commands:
```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK/ && <command>"
```

---

## Change 1 — Create `data/terminology.json`

Create file `/home/phungkien/EHC_HELPDESK/data/terminology.json`:

```json
{
  "clinical": {
    "label": "Lâm sàng / nghiệp vụ y tế",
    "terms": [
      "chỉ định", "y lệnh", "bệnh án", "xử trí", "chẩn đoán", "điều trị",
      "kê đơn", "toa thuốc", "phác đồ", "hội chẩn", "phẫu thuật", "thủ thuật",
      "xét nghiệm", "siêu âm", "X-quang", "nội soi", "bệnh phẩm",
      "vào viện", "ra viện", "xuất viện", "chuyển khoa", "chuyển viện",
      "nhập viện", "đón tiếp", "tiếp nhận", "đăng ký khám", "khám bệnh",
      "bệnh nhân", "người bệnh", "người giám hộ", "thân nhân",
      "viện phí", "BHYT", "bảo hiểm y tế", "thanh toán", "thu ngân",
      "dược", "thuốc", "kho thuốc", "cấp phát thuốc", "lĩnh thuốc",
      "điều dưỡng", "bác sĩ", "dược sĩ", "kỹ thuật viên"
    ]
  },
  "his_modules": {
    "label": "Phân hệ / module HIS",
    "terms": [
      "module", "phân hệ", "màn hình", "form", "giao diện",
      "nội trú", "ngoại trú", "cấp cứu", "phòng khám",
      "CĐHA", "PACS", "MiniPACS", "RIS", "LIS",
      "khoa dược", "kho", "nhà thuốc",
      "hành chính", "danh mục", "cấu hình", "hệ thống",
      "báo cáo", "thống kê", "in ấn", "bảng kê",
      "viện phí", "bảo hiểm", "BHYT", "giảm trừ",
      "phẫu thuật", "gây mê", "hồi sức",
      "tài liệu tuỳ biến", "vỏ bệnh án", "phiếu chỉ định",
      "giấy ra viện", "phiếu khám", "bảng kê 6556"
    ]
  },
  "actions": {
    "label": "Thao tác người dùng",
    "terms": [
      "lưu", "xác nhận", "duyệt", "hủy", "xóa", "sửa", "thêm",
      "tìm kiếm", "tra cứu", "tìm", "lọc",
      "in", "xuất", "export", "import",
      "đăng nhập", "đăng xuất", "mở", "đóng", "chuyển",
      "cập nhật", "đồng bộ", "kết nối", "tải lại"
    ]
  },
  "error_descriptions": {
    "label": "Mô tả lỗi thông tục",
    "terms": [
      "xoay", "quay", "loading", "chờ mãi", "treo", "đứng",
      "mất", "biến mất", "không thấy", "không hiện", "không ra",
      "không được", "không lưu", "không in", "không tìm",
      "lỗi", "báo lỗi", "thông báo đỏ", "crash", "văng",
      "chậm", "lag", "đơ", "tắt đột ngột",
      "không vào được", "không mở được", "bị khóa", "không truy cập"
    ]
  }
}
```

---

## Change 2 — Rewrite `core/intent_guard.py`

Replace the entire file content with:

```python
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
- Hoàn toàn không liên quan đến bệnh viện hoặc phần mềm EHC
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
        prompt = CLASSIFY_PROMPT.format(terminology=_TERMINOLOGY, query=query.strip())
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
```

---

## Verify

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m py_compile core/intent_guard.py && echo OK"
```

```bash
/bin/bash /home/phungkien/EHC_HELPDESK/run.sh -c "
from core.intent_guard import classify
tests = [
    ('xin chào', True),
    ('tạo tài liệu tùy biến như nào', False),
    ('bị lỗi rồi', False),
    ('delete database server', True),
    ('in bảng kê BHYT', False),
]
for q, expect_offtopic in tests:
    result = classify(q)
    status = 'OK' if result == expect_offtopic else 'FAIL'
    print(f'[{status}] \"{q}\" → offtopic={result}')
"
```

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git checkout -b improve/intentguard && git add core/intent_guard.py data/terminology.json && git commit -m 'improve: upgrade IntentGuard with terminology injection and dangerous pattern blocking' && git push origin improve/intentguard"
```
