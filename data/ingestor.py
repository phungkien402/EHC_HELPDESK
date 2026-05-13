"""
Ingestor — Fetches FAQ issues from the Redmine API.

Output: list of Document objects {issue_id, subject, description, url, project}
Skips issues where description is empty or shorter than 20 characters.
Normalizes arrow separators (-->, =>, ==>) to → for consistency.

Run standalone: python -m data.ingestor
"""

from dataclasses import dataclass


@dataclass
class Document:
    """A single FAQ document from Redmine."""
    issue_id: int
    subject: str
    description: str
    project: str
    url: str


def normalize(text: str) -> str:
    """Normalize arrow separators and collapse whitespace."""
    ...


def fetch_all_documents() -> list[Document]:
    """
    Fetch all FAQ issues from Redmine, paginating through all pages.
    Skips issues with empty or too-short descriptions.
    Returns a list of Document objects.
    """
    ...


if __name__ == "__main__":
    docs = fetch_all_documents()
    print(f"Total fetched : {len(docs)} documents")
    print(f"\nExample:")
    if docs:
        print(f"  Subject    : {docs[0].subject}")
        print(f"  Description: {docs[0].description}")
        print(f"  URL        : {docs[0].url}")
