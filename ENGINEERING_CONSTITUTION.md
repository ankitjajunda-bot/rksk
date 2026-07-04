# OctaneFlow Engineering Constitution

This document contains the foundational engineering principles that every future contributor—human or AI—must strictly follow. 

Whenever Codex, Antigravity, another AI, or a human developer proposes a change, the first question must always be: **"Does this violate the Engineering Constitution?"**

If yes, the change is rejected, regardless of how elegant the code is.

---

## The Immutable Principles

### 1. Source Data is Sacred
Source data (opening readings, closing readings, tank dips, selling prices, purchase prices, cash counts, digital collections, tanker quantities) must remain immutable after submission, except through explicit, heavily audited correction workflows.

### 2. Calculations Adapt to Data, Never the Reverse
Calculations must never silently modify or "fudge" user-entered source data to satisfy mathematical continuity, force a ledger to balance, or hide a variance. If the math doesn't balance, the system records the discrepancy.

### 3. Offline Precedence
Offline operation takes absolute precedence over cloud connectivity. The system must be capable of running flawlessly indefinitely without an internet connection. The cloud is merely a transport layer and backup mechanism, not the source of truth for ongoing physical operations.

### 4. Mathematical Explainability
Every financial calculation (e.g., WAC, Gross Margin, Expected Revenue, Variances) must be transparent and explainable. The software must never behave as a "black box" to the accountant or the owner. If a number is derived, its formula and inputs must be accessible.

### 5. Universal Auditability
Every important action, especially financial submissions, shift approvals, and price changes, must be auditable. A clear timeline of *who* did *what* and *when* must exist.

### 6. Cognitive Load Minimization
Prefer reducing operator and owner cognitive load over adding new features. We must minimize the amount of information the human has to remember, the calculations they have to perform mentally, and the number of clicks required to execute core operations. Good software hides complexity.

### 7. Preservation of Human Entry
Human-entered data must be preserved exactly as entered. Derived or calculated data can always be recalculated, but raw source data can never be regenerated if lost or overwritten by a bug.

### 8. Integrity Over Convenience
Financial integrity is fundamentally more important than user convenience. Workflows like batch approvals for shifts or blind auto-syncing that overwrites offline data in the name of "speed" are expressly forbidden if they introduce the risk of silent financial corruption or fraud.

### 9. Task-Driven Design (Optimise Moments, Not Screens)
Users do not interact with screens; they complete tasks. Every workflow must be designed around the specific moment (e.g., Opening Shift, Recording Expense, Depositing Cash) with one clear objective. If a UI element does not help the user complete that specific task, it must be removed or moved to a secondary view.

### 10. The Golden Rule of Visibility
- **Employees**: The software is an assistant, not a form. Provide continuous, live *Operational Calculations* (Liters sold, Cash received, Discrepancies) to reduce mental math and entry errors. Hide all *Business Intelligence* (Profit, WAC, Analytics, Financials).
- **Owners**: The software must answer questions (e.g., "Is the station healthy?") rather than simply displaying raw data. Surface actionable insights before the owner has to search for them.

---

*This document is under version control. Any Pull Request or AI modification that violates these principles will be automatically rejected.*
