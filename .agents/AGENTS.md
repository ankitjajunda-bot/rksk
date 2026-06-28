# Workspace Customization Rules: Agent-to-Agent Coordination

As an Antigravity agent, you MUST follow these instructions immediately on startup:

1. **Auto-Sync Coordination**: You MUST run `python3 git_auto_sync.py` immediately on startup to pull the latest coordination state, response alignment, and codebase updates without conflicts.
2. **Review Coordination State**: Immediately read `agent_alignment.json` and `COMMUNICATION.md` in the project root to align your memory on the latest June 2026 data ingestion rules and current tasks.
3. **Resolve Verification Challenge**: If the challenge in `COMMUNICATION.md` is not answered, write the correct answer in the "AG2 Response" section, commit the file, and push it.
4. **Driver Role**: Check the `active_driver` field in `agent_alignment.json` to coordinate task ownership and prevent code conflicts.
5. **Totalizer Monthly Series Validation**: Whenever patching totalizer readings (open/close) or debugging continuity errors, you MUST refer to the **Monthly Totalizer Range Reference** table below. Ensure any suggested or applied totalizer correction matches these expected monthly bounds. Do not introduce digits that drop the totalizer range or create massive jumps outside these bounds.

## Monthly Totalizer Range Reference

| Month | DU1 Petrol (Nozzle 1) | DU1 Diesel (Nozzle 2) | DU2 Petrol (Nozzle 3) | DU2 Diesel (Nozzle 4) |
| --- | --- | --- | --- | --- |
| **2024-11** | 1.11M - 1.13M | 736k - 769k | *Inactive* | *Inactive* |
| **2024-12** | 1.13M - 1.14M | 769k - 793k | *Inactive* | *Inactive* |
| **2025-01** | 1.14M - 1.16M | 793k - 818k | *Inactive* | *Inactive* |
| **2025-02** | 1.16M - 1.18M | 818k - 843k | *Inactive* | *Inactive* |
| **2025-03** | 1.18M - 1.20M | 843k - 873k | *Inactive* | *Inactive* |
| **2025-04** | 1.20M - 1.22M | 873k - 904k | *Inactive* | *Inactive* |
| **2025-05** | 1.22M - 1.25M | 904k - 933k | *Inactive* | 1.01M - 1.01M |
| **2025-06** | 1.25M - 1.27M | 933k - 959k | *Inactive* | 1.01M - 1.02M |
| **2025-07** | 1.27M - 1.28M | 959k - 970k | -9.02M - -3.4k | 1.02M - 1.03M |
| **2025-08** | 1.28M - 1.30M | 970k - 982k | -3.4k - -2.2k | 1.03M - 1.04M |
| **2025-09** | 1.30M - 1.32M | 982k - 992k | -2.2k - -165 | 1.04M - 1.05M |
| **2025-10** | 1.32M - 1.34M | 992k - 1.01M | -165 - 3.8k | 1.05M - 1.07M |
| **2025-11** | 1.34M - 1.36M | 1.01M - 1.03M | 3.8k - 7.0k | 1.07M - 1.09M |
| **2025-12** | 1.36M - 1.37M | 1.03M - 1.04M | 7.0k - 10.7k | 1.09M - 1.11M |
| **2026-01** | 1.37M - 1.39M | 1.04M - 1.05M | 10.7k - 13.3k | 1.11M - 1.12M |
| **2026-02** | 1.39M - 1.41M | 1.05M - 1.06M | 13.3k - 16.4k | 1.12M - 1.14M |
| **2026-03** | 1.41M - 1.43M | 1.06M - 1.08M | 16.4k - 19.6k | 1.14M - 1.16M |
| **2026-04** | 1.43M - 1.45M | 1.08M - 1.10M | 19.6k - 22.1k | 1.16M - 1.18M |
| **2026-05** | 1.45M - 1.49M | 1.10M - 1.23M | 22.1k - 43.0k | 1.18M - 1.23M |
| **2026-06** | 1.49M - 1.49M | 1.23M - 1.23M | 43.0k - 42.9k | 1.23M - 1.22M |

*Note: Values in the table show opening and closing ranges per month, rounded for quick checks.*
