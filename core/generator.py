"""
Generator — calls vLLM via its OpenAI-compatible API to produce a grounded
answer from the rewritten question and top reranked chunks.

The system prompt strictly instructs the LLM to answer ONLY from the provided
context — no hallucination allowed.

Run standalone: python -m core.generator
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI

from config import VLLM_BASE_URL, VLLM_MODEL
from core.models import RetrievedChunk

SYSTEM_PROMPT = (
    "You are a technical support assistant for the EHC electronic medical record software. "
    "Your job is to answer doctors' questions based SOLELY on the reference documentation "
    "provided in the CONTEXT section below.\n\n"
    "Rules you must follow:\n"
    "1. Use ONLY information present in the CONTEXT. Do not add anything from outside it.\n"
    "2. If the CONTEXT does not contain enough information to answer, say exactly: "
    "\"Tôi không tìm thấy tài liệu hướng dẫn cho vấn đề này.\"\n"
    "3. Keep answers concise and clear. Use numbered steps when describing a procedure.\n"
    "4. Answer in Vietnamese.\n"
    "5. Do not ask the user follow-up questions unless the question is genuinely ambiguous."
)


def _build_user_prompt(query: str, chunks: list[RetrievedChunk]) -> str:
    """Build the user prompt with context chunks and question."""
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        context_parts.append(f"[{i}] {chunk.text}")

    context = "\n\n---\n\n".join(context_parts)

    return f"CONTEXT:\n{context}\n\n---\n\nQUESTION: {query}"


def generate(query: str, chunks: list[RetrievedChunk]) -> str:
    """
    Generate an answer grounded in the provided chunks.
    Returns the answer text string.
    If vLLM is unavailable, returns an error message.
    """
    print(f"[GENERATOR] Context chunks: {len(chunks)}")

    user_prompt = _build_user_prompt(query, chunks)
    print(f"[GENERATOR] Prompt length: ~{len(user_prompt)} chars")

    try:
        client = OpenAI(
            base_url=f"{VLLM_BASE_URL}/v1",
            api_key="not-needed",
        )

        response = client.chat.completions.create(
            model=VLLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=512,
            temperature=0.1,
        )

        answer = response.choices[0].message.content.strip()
        tokens_used = response.usage.total_tokens if response.usage else "N/A"
        print(f"[GENERATOR] Response: \"{answer[:100]}...\"")
        print(f"[GENERATOR] Tokens used: {tokens_used}")
        return answer

    except Exception as e:
        error_msg = f"[GENERATOR] vLLM unavailable ({type(e).__name__}: {e})"
        print(error_msg)
        return "Lỗi: Không thể kết nối đến LLM server. Vui lòng thử lại sau."


if __name__ == "__main__":
    dummy_chunks = [
        RetrievedChunk(
            text="Câu hỏi: Cách gộp hồ sơ bệnh nhân trùng\nHướng dẫn: Module Hành chính → Quản lý bệnh nhân → Chọn 2 hồ sơ → Bấm Gộp",
            score=0.94,
            metadata={"subject": "Cách gộp hồ sơ bệnh nhân trùng"}
        ),
    ]
    answer = generate("Làm sao để gộp hồ sơ bệnh nhân trùng trong EHC?", dummy_chunks)
    print(f"\n[GENERATOR] Final answer: {answer}")
