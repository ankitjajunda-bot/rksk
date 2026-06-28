# Workspace Customization Rules: Agent-to-Agent Coordination

As an Antigravity agent, you MUST follow these instructions immediately on startup:

1. **Auto-Sync Coordination**: You MUST run `python3 git_auto_sync.py` immediately on startup to pull the latest coordination state, response alignment, and codebase updates without conflicts.
2. **Review Coordination State**: Immediately read `agent_alignment.json` and `COMMUNICATION.md` in the project root to align your memory on the latest June 2026 data ingestion rules and current tasks.
3. **Resolve Verification Challenge**: If the challenge in `COMMUNICATION.md` is not answered, write the correct answer in the "AG2 Response" section, commit the file, and push it.
4. **Driver Role**: Check the `active_driver` field in `agent_alignment.json` to coordinate task ownership and prevent code conflicts.
