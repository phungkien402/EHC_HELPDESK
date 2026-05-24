"""
Generator — calls vLLM via its OpenAI-compatible API to produce a grounded
answer from the rewritten question and top reranked chunks.

The system prompt strictly instructs the LLM to answer ONLY from the provided
context — no hallucination allowed.

Run standalone: python -m core.generator
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI, APIConnectionError

from config import VLLM_BASE_URL, VLLM_MODEL
from core.models import RetrievedChunk

# Module-level client — created once when module is first imported
_client = OpenAI(base_url=f"{VLLM_BASE_URL}/v1", api_key="not-needed")

SYSTEM_PROMPT = (
    "You are an expert support specialist for EHC (Ehealthcare Vietnam) — "
    "a HIS/EMR system deployed at hospitals across Vietnam. "
    "You have deep knowledge of the entire system: patient registration, "
    "outpatient/inpatient treatment, pharmacy/drug inventory, lab tests, "
    "medical imaging (CDHA/PACS), surgery, billing/insurance (BHYT), "
    "and reporting.\n\n"
    "Users are doctors, nurses, pharmacists, receptionists, and cashiers "
    "who need help with software tasks.\n\n"
    "How to answer:\n"
    "1. Use the REFERENCE DOCUMENTS below as your primary source. "
    "Prioritize information found there.\n"
    "2. You are allowed to reason, interpret, and connect information across "
    "documents. If the answer can be logically inferred from the context and "
    "your EHC domain knowledge, answer naturally — no need to qualify with "
    "'according to the document'.\n"
    "3. If the question is about EHC but the documents are insufficient, "
    "use your domain knowledge to answer and add: "
    "'Nếu cách này chưa đúng với phiên bản của bạn, liên hệ thêm nhé.'\n"
    "4. For multi-step guidance (3+ steps), use a numbered list. "
    "For 1-2 steps, write as a natural sentence.\n"
    "5. Reply in Vietnamese. Use 'mình' or no subject pronoun, address user as 'bạn'.\n"
    "6. Friendly tone like a helpful colleague — not formal, "
    "do not open with 'Để... bạn hãy thực hiện theo các bước sau:'.\n"
    "7. Vary your openings naturally. "
    "End with: 'Nếu vẫn gặp khó khăn, bạn có thể liên hệ thêm nhé!'\n"
    "8. Do NOT fabricate specific menu names or navigation paths you are not "
    "sure about. If uncertain about an exact path, say so rather than guess wrong."
)


def _build_user_prompt(
    query: str,
    chunks: list[RetrievedChunk],
    history: list[dict] = None,
    user_intent: str = None,
) -> str:
    """Build the user prompt with reference docs, conversation history, and question."""
    parts = []

    if user_intent:
        parts.append(f"[User issue: {user_intent}]\n")

    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        subject = chunk.metadata.get("subject", "") if chunk.metadata else ""
        label = f"[Document {i}]" + (f" — {subject}" if subject else "")
        context_parts.append(f"{label}\n{chunk.text}")

    context = "\n\n---\n\n".join(context_parts)
    parts.append(f"REFERENCE DOCUMENTS:\n{context}")

    if history:
        recent = history[-4:]
        history_lines = []
        for turn in recent:
            role = "User" if turn["role"] == "user" else "Assistant"
            history_lines.append(f"{role}: {turn['text']}")
        parts.append("\nCONVERSATION HISTORY:\n" + "\n".join(history_lines))

    parts.append(f"\n---\n\nQUESTION: {query}")

    return "\n".join(parts)


class GeneratorError(Exception):
    """Raised when the generator cannot produce an answer (e.g. vLLM down)."""
    pass


class LLMUnavailableError(GeneratorError):
    """Raised specifically when vLLM is unreachable after retry (APIConnectionError)."""
    pass


def generate(query: str, chunks: list[RetrievedChunk], history: list[dict] = None, user_intent: str = None) -> str:
    """
    Generate an answer grounded in the provided chunks.
    Returns the answer text string.
    Raises GeneratorError if vLLM is unavailable.
    """
    print(f"[GENERATOR] Context chunks: {len(chunks)}")
    if user_intent:
        print(f"[GENERATOR] User intent: \"{user_intent}\"")

    user_prompt = _build_user_prompt(query, chunks, history, user_intent=user_intent)
    print(f"[GENERATOR] Prompt length: ~{len(user_prompt)} chars")

    try:
        response = _client.chat.completions.create(
            model=VLLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=800,
            temperature=0.3,
        )

        answer = response.choices[0].message.content.strip()
        tokens_used = response.usage.total_tokens if response.usage else "N/A"
        print(f"[GENERATOR] Response: \"{answer[:100]}...\"")
        print(f"[GENERATOR] Tokens used: {tokens_used}")
        return answer

    except APIConnectionError as e:
        # Retry once after 2s — vLLM may be busy with another request
        print(f"[GENERATOR] Connection error, retrying in 2s...")
        time.sleep(2)
        try:
            response = _client.chat.completions.create(
                model=VLLM_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=800,
                temperature=0.3,
            )
            answer = response.choices[0].message.content.strip()
            tokens_used = response.usage.total_tokens if response.usage else "N/A"
            print(f"[GENERATOR] Response (retry): \"{answer[:100]}...\"")
            print(f"[GENERATOR] Tokens used: {tokens_used}")
            return answer
        except Exception as retry_e:
            print(f"[GENERATOR] Retry failed ({type(retry_e).__name__}: {retry_e})")
            raise LLMUnavailableError(str(retry_e)) from retry_e

    except Exception as e:
        error_msg = f"[GENERATOR] vLLM unavailable ({type(e).__name__}: {e})"
        print(error_msg)
        raise GeneratorError(str(e)) from e


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
