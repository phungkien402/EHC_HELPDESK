"""
Query Rewriter — extracts the core technical problem from colloquial user messages.

Uses the LLM (via vLLM OpenAI-compatible API) to bridge the gap between how
doctors ask questions (short, informal) and how the FAQ is written (formal).

Run standalone: python -m core.query_rewriter
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI, APIConnectionError

from config import VLLM_BASE_URL, VLLM_MODEL
from core.generator import LLMUnavailableError
from core.abbreviations import expand_abbreviations

# Module-level client — created once when module is first imported
_client = OpenAI(base_url=f"{VLLM_BASE_URL}/v1", api_key="not-needed")

SYSTEM_PROMPT = (
    "You are a query understanding assistant for EHC electronic medical record software support. "
    "Your job is to read a user's message and rewrite it as a clear, searchable issue statement "
    "that matches how FAQ entries are written.\n\n"
    "Rules:\n"
    "1. PRESERVE symptom/action signal words — keep 'sai', 'lỗi', 'không được', 'bị', "
    "'trắng xóa', 'không lên', 'không tìm thấy' etc. These are critical for retrieval.\n"
    "2. GENERALIZE specific instance names to their category — FAQ entries are written "
    "generically, so strip the specific name and keep the category:\n"
    "   - Specific service names (nội soi trực tràng, siêu âm bụng, X-quang ngực...) → 'dịch vụ'\n"
    "   - Specific drug names (amoxicillin, paracetamol...) → 'thuốc'\n"
    "   - Specific patient names or codes → 'bệnh nhân'\n"
    "3. Output a short statement (1 sentence), not a question.\n"
    "4. Add the correct prefix:\n"
    "   - 'Lỗi...' when the input describes an error, crash, or unexpected behavior.\n"
    "   - 'Cách...' when the input is a how-to or navigation question.\n"
    "   - 'Vị trí...' when asking where something is in the UI.\n"
    "5. Output in Vietnamese. Return only the rewritten query — no explanation.\n\n"
    "BAD:\n"
    "  'nội soi trực tràng bị sai giá BHYT' → 'Cách sửa giá dịch vụ nội soi trực tràng bị sai BHYT'  ← keeps specific name\n"
    "  'dịch vụ bị sai giá'                 → 'thay đổi giá dịch vụ'  ← loses 'sai'\n"
    "  'không in được'                       → 'in phiếu'              ← loses 'không được'\n\n"
    "GOOD:\n"
    "  'nội soi trực tràng bị sai giá BHYT' → 'Cách sửa giá dịch vụ bị sai BHYT'\n"
    "  'siêu âm bụng tính giá sai'          → 'Cách sửa giá dịch vụ bị sai'\n"
    "  'thuốc amoxicillin hết kho'          → 'Cách xử lý khi thuốc hết tồn kho'\n"
    "  'dịch vụ bị sai giá'                 → 'Cách sửa giá dịch vụ bị sai'\n"
    "  'không in được vỏ bệnh án'           → 'Lỗi không in được vỏ bệnh án'\n"
    "  'xử trí cứ xoay hoài không dừng'     → 'Lỗi màn hình xoay mãi khi xử trí bệnh nhân'\n"
    "  'in giấy ra viện lại ở đâu'          → 'Vị trí in lại giấy ra viện trong hệ thống'\n"
    "  'BN ra viện rồi muốn sửa thông tin'  → 'Cách sửa thông tin bệnh nhân sau khi ra viện'\n"
)

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


def _build_messages(text: str) -> list[dict]:
    """Build the message list with system prompt and few-shot examples."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user_ex, assistant_ex in FEW_SHOT_EXAMPLES:
        messages.append({"role": "user", "content": user_ex})
        messages.append({"role": "assistant", "content": assistant_ex})
    messages.append({"role": "user", "content": text})
    return messages


INTENT_PROMPT = (
    "Bạn là trợ lý phân tích ý định người dùng cho phần mềm bệnh án điện tử EHC.\n"
    "Đọc tin nhắn của người dùng và mô tả ngắn gọn (1 câu) vấn đề họ đang gặp phải.\n"
    "Viết ở ngôi thứ 3, ví dụ: \"Bác sĩ đang gặp lỗi màn hình xoay liên tục khi xử trí bệnh nhân.\"\n"
    "Chỉ trả về 1 câu mô tả — không giải thích thêm."
)

CONTEXTUAL_INTENT_PROMPT = (
    "Bạn là trợ lý hiểu phần mềm EHC. Dựa vào tài liệu tham khảo, "
    "hãy mô tả ngắn gọn vấn đề người dùng đang gặp (1 câu).\n"
    "Viết ở ngôi thứ 3, ví dụ: \"Bác sĩ đang gặp lỗi màn hình xoay liên tục khi xử trí bệnh nhân.\"\n"
    "Chỉ trả về 1 câu mô tả — không giải thích thêm."
)


def analyze_intent(query: str, chunks: list = None) -> str | None:
    """
    Analyze user intent — returns a 1-sentence Vietnamese description of the
    user's problem for internal use (injected into generator prompt).

    If chunks are provided, uses them as context for grounded intent analysis.
    If not, falls back to blind analysis (no context).
    Returns None if vLLM is unavailable.
    """
    if chunks:
        print(f"[INTENT] Contextual analysis with {len(chunks)} chunks: \"{query}\"")
        # Build context from chunks
        chunk_texts = []
        for i, c in enumerate(chunks, 1):
            subject = c.metadata.get("subject", "")
            text = c.text or c.metadata.get("description", "")
            chunk_texts.append(f"{i}. {subject}: {text}")
        context_block = "\n".join(chunk_texts)

        user_content = f"Tài liệu tham khảo:\n{context_block}\n\nCâu hỏi: {query}"
        system_prompt = CONTEXTUAL_INTENT_PROMPT
    else:
        print(f"[INTENT] Blind analysis (no chunks): \"{query}\"")
        user_content = query
        system_prompt = INTENT_PROMPT

    try:
        response = _client.chat.completions.create(
            model=VLLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=100,
            temperature=0.1,
        )

        intent = response.choices[0].message.content.strip()
        print(f"[INTENT] Result: \"{intent}\"")
        return intent

    except APIConnectionError as e:
        # Retry once after 1s — vLLM may be busy
        print(f"[INTENT] Connection error, retrying in 1s...")
        time.sleep(1)
        try:
            response = _client.chat.completions.create(
                model=VLLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=100,
                temperature=0.1,
            )
            intent = response.choices[0].message.content.strip()
            print(f"[INTENT] Result (retry): \"{intent}\"")
            return intent
        except Exception:
            print(f"[INTENT] Retry failed, skipping intent analysis")
            return None

    except Exception as e:
        print(f"[INTENT] vLLM unavailable ({type(e).__name__}), skipping intent analysis")
        return None


def rewrite(text: str) -> str:
    """
    Rewrite a colloquial question into a clear intent statement.
    Returns the rewritten query string.
    If vLLM is unavailable, returns the original text as-is.
    """
    text = expand_abbreviations(text)
    print(f"[REWRITER] Original : \"{text}\"")

    try:
        response = _client.chat.completions.create(
            model=VLLM_MODEL,
            messages=_build_messages(text),
            max_tokens=150,
            temperature=0.1,
        )

        rewritten = response.choices[0].message.content.strip()
        print(f"[REWRITER] Rewritten: \"{rewritten}\"")
        return rewritten

    except APIConnectionError as e:
        # Retry once after 1s — vLLM may be busy
        print(f"[REWRITER] Connection error, retrying in 1s...")
        time.sleep(1)
        try:
            response = _client.chat.completions.create(
                model=VLLM_MODEL,
                messages=_build_messages(text),
                max_tokens=150,
                temperature=0.1,
            )
            rewritten = response.choices[0].message.content.strip()
            print(f"[REWRITER] Rewritten (retry): \"{rewritten}\"")
            return rewritten
        except Exception as retry_e:
            print(f"[REWRITER] Retry failed ({type(retry_e).__name__}), raising LLMUnavailableError")
            raise LLMUnavailableError(str(retry_e)) from retry_e

    except Exception as e:
        print(f"[REWRITER] vLLM unavailable ({type(e).__name__}), raising LLMUnavailableError")
        raise LLMUnavailableError(str(e)) from e


ANALYZE_AND_REWRITE_PROMPT = (
    "Bạn là trợ lý EHC. Dựa vào tài liệu tham khảo (nếu có), hãy thực hiện 3 việc:\n"
    "1. Mô tả ngắn gọn vấn đề người dùng đang gặp (1 câu, ngôi thứ 3)\n"
    "2. Viết lại câu hỏi thành query tìm kiếm ngắn gọn, formal tiếng Việt\n"
    "3. Đánh giá xem câu hỏi có đủ thông tin để trả lời không\n\n"
    "Trả về đúng 3 dòng:\n"
    "INTENT: <mô tả vấn đề>\n"
    "QUERY: <query tìm kiếm>\n"
    "ANSWERABLE: <yes | no | unclear>\n\n"
    "Hướng dẫn viết QUERY — áp dụng 2 rule:\n"
    "Rule 1 — GIỮ từ chỉ triệu chứng/lỗi: 'sai', 'lỗi', 'không được', 'bị', "
    "'trắng xóa', 'không lên', 'không tìm thấy', 'xoay hoài' v.v.\n"
    "Rule 2 — TỔNG QUÁT HÓA tên thực thể cụ thể về category (vì FAQ viết generic):\n"
    "  + Tên dịch vụ cụ thể (nội soi trực tràng, siêu âm bụng...) → 'dịch vụ'\n"
    "  + Tên thuốc cụ thể (amoxicillin, paracetamol...) → 'thuốc'\n"
    "  + Tên/mã bệnh nhân cụ thể → 'bệnh nhân'\n\n"
    "Ví dụ đúng:\n"
    "  'nội soi trực tràng bị sai giá BHYT' → 'Cách sửa giá dịch vụ bị sai BHYT'\n"
    "  'dịch vụ bị sai giá'                 → 'Cách sửa giá dịch vụ bị sai'\n"
    "Ví dụ sai:\n"
    "  'nội soi trực tràng bị sai giá BHYT' → 'Cách sửa giá dịch vụ nội soi trực tràng bị sai BHYT' (giữ tên cụ thể)\n"
    "  'dịch vụ bị sai giá'                 → 'thay đổi giá dịch vụ' (mất chữ 'sai')\n\n"
    "Thêm prefix: 'Lỗi...' cho lỗi/sự cố, 'Cách...' cho how-to.\n\n"
    "Hướng dẫn ANSWERABLE:\n"
    "- yes: câu hỏi đủ thông tin, có thể tìm kiếm và trả lời\n"
    "- unclear: quá mơ hồ — không biết module nào, lỗi gì, thao tác nào. "
    "Ví dụ: 'mình không in được', 'bị lỗi rồi', 'không vào được'\n"
    "- no: hoàn toàn không liên quan\n\n"
    "Nếu lịch sử hội thoại đã làm rõ → ANSWERABLE=yes dù câu hiện tại ngắn.\n"
    "Nếu không có tài liệu nhưng câu hỏi rõ ràng → ANSWERABLE=yes."
)


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


if __name__ == "__main__":
    test_queries = [
        "merge patient records how?",
        "in phiếu khám ở đâu",
        "thuốc hết tồn kho làm sao",
        "xử trí cứ xoay hoài không dừng",
        "phần mềm bắt update mới vô được",
    ]
    for q in test_queries:
        result = rewrite(q)
        print()
