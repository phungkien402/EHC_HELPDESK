# LOCAL ASSISTANT — Fix Query Rewrite: Preserve Domain Wording

_Branch: LOCAL_ASSISTANT_

## Goal

Fix `ANALYZE_AND_REWRITE_PROMPT` and `SYSTEM_PROMPT` in `core/query_rewriter.py` so
the rewriter preserves domain-specific signal words instead of abstracting them away.

Current bad behavior:
  "dịch vụ bị sai giá"   →  "thay đổi giá dịch vụ"   (loses "sai" signal)
  "không in được"        →  "in phiếu"                (loses "lỗi/không được" signal)

Expected behavior:
  "dịch vụ bị sai giá"   →  "Cách sửa giá dịch vụ bị sai trong EHC"
  "không in được"        →  "Lỗi không in được phiếu trong EHC"

The rule: clarify and formalize — do NOT remove error/symptom words.

## Project path

```
/home/phungkien/EHC_HELPDESK
```

---

## Step 0 — Read source files before making any changes

Use `mcp__code-review-graph` to read each file listed below in full before
touching anything. Do not rely on memory or assume file structure — read first.

Files to read:
- `core/query_rewriter.py`

---

## Change 1 — `core/query_rewriter.py`

### 1a. Replace `SYSTEM_PROMPT` (standalone rewrite prompt)

Find the existing `SYSTEM_PROMPT` constant used by `rewrite()` and replace it entirely:

```python
SYSTEM_PROMPT = (
    "You are a query understanding assistant for EHC electronic medical record software support. "
    "Your job is to read a user's message and rewrite it as a clear, searchable issue statement "
    "that matches how FAQ entries are written.\n\n"
    "Rules:\n"
    "1. PRESERVE domain signal words — keep 'sai', 'lỗi', 'không được', 'bị', 'trắng xóa', "
    "'không lên', 'không tìm thấy' etc. These words are critical for retrieval.\n"
    "2. Output a short statement (1 sentence), not a question.\n"
    "3. Add the correct prefix:\n"
    "   - 'Lỗi...' when the input describes an error, crash, malfunction, or unexpected behavior.\n"
    "   - 'Cách...' when the input is a how-to or navigation question.\n"
    "   - 'Vị trí...' when asking where something is in the UI.\n"
    "4. Use technical terms that would appear in a FAQ title. Output in Vietnamese.\n"
    "5. Return only the rewritten query — no explanation.\n\n"
    "BAD examples (do not do this):\n"
    "  'dịch vụ bị sai giá' → 'thay đổi giá dịch vụ'  ← WRONG, loses 'sai'\n"
    "  'không in được'      → 'in phiếu'               ← WRONG, loses 'không được'\n\n"
    "GOOD examples:\n"
    "  'dịch vụ bị sai giá' → 'Cách sửa giá dịch vụ bị sai trong EHC'\n"
    "  'không in được'      → 'Lỗi không in được phiếu trong EHC'\n"
    "  'xử trí cứ xoay hoài không dừng' → 'Lỗi màn hình xoay mãi khi xử trí bệnh nhân'\n"
    "  'in giấy ra viện lại ở đâu'      → 'Vị trí in lại giấy ra viện trong hệ thống'\n"
    "  'BN ra viện rồi muốn sửa thông tin' → 'Cách sửa thông tin bệnh nhân sau khi ra viện'\n"
)
```

### 1b. Replace `FEW_SHOT_EXAMPLES` list

Find the existing `FEW_SHOT_EXAMPLES` list and replace it entirely:

```python
FEW_SHOT_EXAMPLES = [
    # Error cases — preserve "lỗi/không/bị" signal
    ("xử trí cứ xoay hoài không dừng",
     "Lỗi màn hình xoay mãi khi xử trí bệnh nhân"),
    ("phần mềm bắt update mới vô được",
     "Lỗi phần mềm bắt buộc cập nhật mới đăng nhập được"),
    ("in phiếu không lên form view làm sao",
     "Lỗi in phiếu không hiển thị form view"),
    ("dịch vụ bị sai giá",
     "Cách sửa giá dịch vụ bị sai trong EHC"),
    ("không in được vỏ bệnh án",
     "Lỗi không in được vỏ bệnh án trong EHC"),
    ("quét thẻ BHYT báo không tìm thấy bệnh nhân",
     "Lỗi quét thẻ bảo hiểm y tế không tìm thấy bệnh nhân"),
    # How-to cases — add clarifying context, keep domain wording
    ("in giấy ra viện lại ở đâu",
     "Vị trí in lại giấy ra viện trong hệ thống"),
    ("muốn hủy nhập viện thì bấm vào đâu",
     "Cách hủy nhập viện trong hệ thống EHC"),
    ("BN ra viện rồi muốn sửa thông tin",
     "Cách sửa thông tin bệnh nhân sau khi đã ra viện"),
    ("merge patient records how?",
     "Cách gộp mã bệnh nhân"),
    ("thuốc hết tồn kho làm sao",
     "Cách xử lý khi thuốc hết tồn kho trong kho dược"),
]
```

### 1c. Replace `ANALYZE_AND_REWRITE_PROMPT`

Find the existing `ANALYZE_AND_REWRITE_PROMPT` constant and replace it entirely:

```python
ANALYZE_AND_REWRITE_PROMPT = (
    "Bạn là trợ lý EHC. Dựa vào tài liệu tham khảo (nếu có), hãy thực hiện 3 việc:\n"
    "1. Mô tả ngắn gọn vấn đề người dùng đang gặp (1 câu, ngôi thứ 3)\n"
    "2. Viết lại câu hỏi thành query tìm kiếm ngắn gọn, formal tiếng Việt\n"
    "3. Đánh giá xem câu hỏi có đủ thông tin để trả lời không\n\n"
    "Trả về đúng 3 dòng theo format:\n"
    "INTENT: <mô tả vấn đề>\n"
    "QUERY: <query tìm kiếm>\n"
    "ANSWERABLE: <yes | no | unclear>\n\n"
    "Hướng dẫn viết QUERY:\n"
    "- GIỮ NGUYÊN các từ chỉ triệu chứng/lỗi: 'sai', 'lỗi', 'không được', 'bị', "
    "'trắng xóa', 'không lên', 'không tìm thấy', 'xoay hoài' v.v.\n"
    "- CHỈ làm rõ và formal hóa — KHÔNG abstract bỏ signal domain quan trọng.\n"
    "- Thêm prefix đúng: 'Lỗi...' cho lỗi/sự cố, 'Cách...' cho how-to.\n"
    "- Ví dụ đúng: 'dịch vụ bị sai giá' → 'Cách sửa giá dịch vụ bị sai'\n"
    "- Ví dụ sai:  'dịch vụ bị sai giá' → 'thay đổi giá dịch vụ' (mất chữ 'sai')\n\n"
    "Hướng dẫn cho ANSWERABLE:\n"
    "- yes: câu hỏi đủ thông tin, có thể tìm kiếm và trả lời\n"
    "- unclear: câu hỏi quá mơ hồ — không đề cập module nào, lỗi gì, thao tác nào. "
    "Ví dụ: 'mình không in được', 'bị lỗi rồi', 'không vào được'\n"
    "- no: hoàn toàn không liên quan hoặc không có tài liệu tham khảo\n\n"
    "Nếu lịch sử hội thoại đã làm rõ vấn đề → ANSWERABLE=yes dù câu hỏi hiện tại ngắn.\n"
    "Nếu không có tài liệu tham khảo nhưng câu hỏi rõ ràng → ANSWERABLE=yes."
)
```

---

## Verify

### Syntax check

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m py_compile core/query_rewriter.py && echo OK"
```

### Test rewriter standalone

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && python3 -m core.query_rewriter"
```

### Key test cases — check output preserves domain signals

```
"dịch vụ bị sai giá"        → expect: keeps "sai" in output
"không in được vỏ bệnh án"  → expect: keeps "không in được"
"xử trí cứ xoay hoài"       → expect: keeps "xoay" or "xoay mãi"
"in bảng kê BHYT ở đâu"     → expect: "Vị trí in bảng kê bảo hiểm y tế" or similar
```

### Restart and test via Slack bot

```bash
sudo systemctl restart ehc-helpdesk
```

---

## Git

```bash
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git add core/query_rewriter.py && git commit -m 'fix: rewrite prompt preserves domain signal words (sai, lỗi, không được)' && git push origin LOCAL_ASSISTANT"
```
