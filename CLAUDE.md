# CLAUDE.md

Working agreement for Claude Code on this repository.

## Environment

- Server: Dell R730xd, 2x V100 16GB, Ubuntu
- Project: EHC AI Helpdesk (on-premise RAG chatbot, Vietnamese)
- Repo path: `/home/phungkien/EHC_HELPDESK/`
- Remote: `git@github.com:phungkien402/EHC_HELPDESK.git` (SSH)

## Commands

**The shell environment lacks PATH — only `/bin/bash` works. Use the patterns below.**

```bash
# --- Shell/system commands (git, ls, find, etc.) ---
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && <command>"

# Examples:
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && git status"
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && ls -la"

# --- Python commands ---
# Use run.sh (sets PATH + cd into project + runs python3):
/bin/bash /home/phungkien/EHC_HELPDESK/ehc-helpdesk/run.sh -m <module>

# Examples:
/bin/bash /home/phungkien/EHC_HELPDESK/run.sh -m core.pipeline
/bin/bash /home/phungkien/EHC_HELPDESK/run.sh -m tests.debug_query "your question"
/bin/bash /home/phungkien/EHC_HELPDESK/run.sh -m uvicorn api.routes:app --host 0.0.0.0 --port 8080
/bin/bash /home/phungkien/EHC_HELPDESK/run.sh -m tests.evaluate
```

## Git Workflow

```bash
# Always run git from the repo directory:
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git commit -m 'your message'"
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git add -A && git status"
/bin/bash -c "export PATH=/home/phungkien/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /home/phungkien/EHC_HELPDESK && git push origin main"
```

### Branching Rules

- For new features or experimental changes, always create a new branch first:
  `git checkout -b feature/<short-description>`
- Only merge to main after the reviewer (via Cowork) approves
- Branch naming convention: `feature/<name>`, `fix/<name>`, `experiment/<name>`
- Never commit experimental or untested changes directly to main

### Commit Convention

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that neither fixes a bug nor adds a feature

## Review Workflow

1. Implement the change
2. Commit to appropriate branch
3. Push and create PR if on feature branch
4. Reviewer (via Cowork) reviews
5. Fix any issues raised
6. Merge to main only after approval

## Subagents

Spawn subagents to isolate context, parallelize independent work, or offload bulk mechanical tasks. Don't spawn when the parent needs the reasoning, when synthesis requires holding things together, or when spawn overhead dominates.

Pick the cheapest model that can do the subtask well:
- Haiku: bulk mechanical work, no judgment
- Sonnet: scoped research, code exploration, in-scope synthesis
- Opus: subtasks needing real planning or tradeoffs

If a subagent realizes it needs a higher tier than itself, return to the parent.

Parent owns final output and cross-spawn synthesis. User instructions override.

## Preferred Tools

### Data Fetching

1. **WebFetch**: free, text-only, works on public pages that don't block bots.
2. **agent-browser CLI**: free, local Rust CLI + Chrome via CDP. For dynamic pages or auth walls that WebFetch can't handle. Returns the accessibility tree with element refs (@e1, @e2). ~82% fewer tokens than screenshot-based tools. Install: `npm i -g agent-browser && agent-browser install`. Use `snapshot` for AI-friendly DOM state, element refs for interaction.
3. **Notice recurring fetch patterns and propose wrapping them as dedicated tools.** When the same fetch/parse logic comes up more than once, suggest wrapping it as a named tool (e.g. a skill file or a .py script that calls `agent-browser` with the snapshot and extraction steps baked in for that source).

### PDF Files

Use 'pdftotext', not the 'Read' tool. Use 'Read' only when the user directly asks to analyze images or charts inside the document. Read loads PDFs as images.