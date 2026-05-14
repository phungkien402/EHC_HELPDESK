"""
Query Rewriter — normalizes colloquial Vietnamese questions into formal queries.

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
    "You are a query normalization assistant. Convert colloquial, shorthand "
    "questions about the EHC electronic medical record software into clear, complete "
    "formal questions in Vietnamese. Return only the rewritten question — no explanation.\n\n"
    "Examples:\n"
    "User: in phiếu không lên form view làm sao\n"
    "Assistant: Khi in phiếu thì form view không hiển thị, phải làm gì?\n\n"
    "User: phần mềm bắt update mới vô được\n"
    "Assistant: Tại sao phần mềm bắt buộc phải update mới đăng nhập được?\n\n"
    "User: in giấy ra viện lại ở đâu\n"
    "Assistant: Muốn in lại giấy ra viện thì vào đâu trong hệ thống?"
)


def rewrite(text: str) -> str:
    """
    Rewrite a colloquial question into a formal, complete query.
    Returns the rewritten question string.
    If vLLM is unavailable, returns the original text as-is.
    """
    print(f"[REWRITER] Original : \"{text}\"")

    try:
        response = _client.chat.completions.create(
            model=VLLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
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
    ]
    for q in test_queries:
        result = rewrite(q)
        print()
