"""
Query Rewriter — extracts the core technical problem from colloquial user messages.

Uses the LLM (via vLLM OpenAI-compatible API) to bridge the gap between how
doctors ask questions (short, informal) and how the FAQ is written (formal).

Run standalone: python -m core.query_rewriter
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI

from config import VLLM_BASE_URL, VLLM_MODEL

# Module-level client — created once when module is first imported
_client = OpenAI(base_url=f"{VLLM_BASE_URL}/v1", api_key="not-needed")

SYSTEM_PROMPT = (
    "You are a query understanding assistant for EHC electronic medical record software support. "
    "Your job is to read a user's message and extract the core technical problem they are experiencing, "
    "expressed as a short, clear issue statement that matches how FAQ entries are written.\n\n"
    "Rules:\n"
    "1. Focus on WHAT the problem is, not HOW the user described it.\n"
    "2. Output a short statement (1 sentence), not a question.\n"
    "3. Use technical terms that would appear in a FAQ title.\n"
    "4. If the message is already a clear technical question, keep it as-is.\n"
    "5. Output in Vietnamese. Return only the rewritten query — no explanation."
)

FEW_SHOT_EXAMPLES = [
    ("merge patient records how?", "Cách gộp mã bệnh nhân"),
    ("xử trí cứ xoay hoài không dừng", "Lỗi màn hình xoay mãi khi xử trí bệnh nhân"),
    ("phần mềm bắt update mới vô được", "Lỗi phần mềm bắt buộc cập nhật mới đăng nhập được"),
    ("in phiếu không lên form view làm sao", "Lỗi in phiếu không hiển thị form view"),
    ("in giấy ra viện lại ở đâu", "Vị trí in lại giấy ra viện trong hệ thống"),
    ("xem giúp tôi hẹn bệnh nhân nhưng hệ thống tự nhảy vào thứ 7 chủ nhật", "Lỗi module đặt hẹn tự chọn sai ngày trong tuần"),
    ("BN ra viện rồi muốn sửa thông tin", "Cách sửa thông tin bệnh nhân sau khi đã xử trí ra viện"),
]


def _build_messages(text: str) -> list[dict]:
    """Build the message list with system prompt and few-shot examples."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user_ex, assistant_ex in FEW_SHOT_EXAMPLES:
        messages.append({"role": "user", "content": user_ex})
        messages.append({"role": "assistant", "content": assistant_ex})
    messages.append({"role": "user", "content": text})
    return messages


def rewrite(text: str) -> str:
    """
    Rewrite a colloquial question into a clear intent statement.
    Returns the rewritten query string.
    If vLLM is unavailable, returns the original text as-is.
    """
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

    except Exception as e:
        print(f"[REWRITER] vLLM unavailable ({type(e).__name__}), using original query")
        return text


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
