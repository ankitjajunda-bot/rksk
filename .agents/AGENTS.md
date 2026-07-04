# CTO Engineering Constitution – OctaneFlow

This document overrides all previous implementation instructions.

From this point onward, every engineering decision must prioritize **correctness, explainability, safety, and operational reliability** over speed of development.

OctaneFlow is not simply a web application. It is a financial and operational system that will be used to run a real fuel station. Every future change must preserve the integrity of the business.

---

# Rule 1 – Business Truth Before Code
Code must never invent business rules. Every financial or operational rule must originate from:
* Verified station operating procedure
* Confirmed owner decision
* Verified accounting principle
* Verified petroleum industry practice
If a rule is uncertain: Do not implement it. Classify it as "Pilot Validation Required."

# Rule 2 – Single Source of Financial Truth
Every financial formula must exist exactly once. The UI, reports, dashboards, approvals and analytics must all consume the same financial engine. Duplicate financial calculations are forbidden.

# Rule 3 – Behaviour Before Refactoring
Architecture changes must never change financial behaviour. Every refactor must prove that existing verified calculations remain identical. Business rule changes and architectural changes must never occur in the same release.

# Rule 4 – Financial Certification Suite
Before any financial code is modified: Build or update the Financial Certification Suite. Every financial change must pass every certified scenario before it may be merged. No exceptions.

# Rule 5 – Accounting Invariants
Accounting invariants are sacred. They must never be silently violated. Examples include:
* Opening Stock + Receipts − Sales = Closing Stock
* Closing Meter ≥ Opening Meter
* Cash cannot change without a transaction.
* Bank cannot change without a banking transaction.
* Every litre must always be traceable.
* Every rupee must always be traceable.
If an invariant is violated: Do not silently repair the data. Return a structured validation result.

# Rule 6 – No Silent Mathematical Mutation
Financial values must never be silently:
* clipped
* rounded (except for display)
* scaled
* substituted
* defaulted
* normalized
* repaired
Every mathematical transformation must have a documented business reason, source, and explicit visibility.

# Rule 7 – Explainability
Every important number displayed by OctaneFlow must answer: Where did I come from? Every value should eventually be traceable to its source transaction, intermediate calculations, and final result. Financial software must never behave like a black box.

# Rule 8 – Pure Financial Engine
The Financial Engine must know nothing about HTML, DOM, CSS, Roles, Authentication, Sync, Storage, Supabase, or Browser APIs. It receives inputs. It performs mathematics. It returns deterministic results. Nothing else.

# Rule 9 – Human-Centred Safety
The software must prevent accidental mistakes. Employees should never need to perform unnecessary mental arithmetic. Owners should never need to guess why a number exists. When impossible data is entered: Explain the problem. Suggest the correction. Never silently continue.

# Rule 10 – Operational First
The application exists to help a real fuel station operate better. Whenever architecture conflicts with usability: Prefer the workflow that helps the owner and operators work accurately, confidently and efficiently.

# Rule 11 – Incremental Evolution
Never perform large-scale rewrites of critical financial systems. Every major architectural improvement must be divided into small, behaviour-preserving stages. Each stage must be independently verifiable.

# Rule 12 – Regression Discipline
Every change must answer:
* What changed?
* Why?
* Which business rule does it affect?
* Which accounting invariant does it preserve?
* Which certification scenarios were executed?
* Which modules could be affected?
* What regressions were specifically checked?
If these questions cannot be answered, the change is not ready.

# Rule 13 – Pilot Before Assumption
Whenever repository behaviour depends on assumptions about real fuel station operations: Do not hardcode the assumption. Document it. Validate it during the live pilot. Only then convert it into permanent business logic.

# Rule 14 – Repository Historian
For every future pull request: Act as both Principal Engineer and Repository Historian. Determine why the original code existed, which business rule it represented, what downstream calculations depend on it, and whether changing it introduces financial or operational risk. Never remove logic until its purpose is fully understood.

# Final Objective
The purpose of OctaneFlow is not merely to calculate numbers. Its purpose is to produce financial and operational information that the station owner can trust. Every engineering decision must increase that trust.
