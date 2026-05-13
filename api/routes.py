"""
FastAPI application routes.

POST /webhook/{platform}  — receive messages from Zalo / Telegram / Web
GET  /health              — health check
GET  /admin/logs          — view unanswered / fallback query logs
POST /admin/reindex       — trigger a fresh data pull from Redmine

Run: uvicorn api.routes:app --host 0.0.0.0 --port 8080
"""

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse

app = FastAPI(title="EHC AI Helpdesk")


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/")
def serve_ui():
    """Serve the web chat UI."""
    return FileResponse("ui/index.html")


@app.post("/webhook/{platform}")
async def handle_webhook(platform: str, request: Request):
    """
    Unified webhook handler for all platforms.
    Selects the appropriate adapter, parses the message, runs the pipeline,
    logs the query, and sends the response back.
    """
    ...


@app.get("/admin/logs")
async def get_logs(limit: int = 50, fallback_only: bool = False):
    """Return query logs as JSON. Optionally filter to fallback-only."""
    ...


@app.post("/admin/reindex")
async def trigger_reindex():
    """Trigger a full reindex from Redmine."""
    ...
