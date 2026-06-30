# OctaneFlow Project - AI Agent Guardrails

You are assisting the owner of a fuel station in building an offline-first vanilla Javascript application. 
Because the application is highly stateful and relies on direct DOM manipulation and `localStorage`, tiny mistakes (like undefined variables or race conditions) will cause catastrophic data loss for the user's business.

You MUST follow these strict rules on every interaction.

## Rule 1: No Undefined Variables
Before modifying or inserting any code, you MUST physically verify that every variable you reference is declared in the local scope, or explicitly passed as a function argument, or explicitly declared as a global variable elsewhere in the codebase.
If you are unsure, use the `grep_search` tool to find the variable definition before writing the code.

## Rule 2: Synchronous Local Storage Safety
Do not introduce `await` inside critical `localStorage` loops unless absolutely necessary.
Always merge `cloudData` safely. Never overwrite local properties implicitly.

## Rule 3: Single Source of Truth
Never allow employee devices to overwrite the master `app_state`. `app_state` (Settings, Users, Prices) is strictly Owner-Authoritative.
If modifying `sync.js`, ensure `isOwner` checks are perfectly preserved.

## Rule 4: HTML Hardcoding
If you add a dynamic feature to JS, verify that the corresponding HTML elements exist in `index.html` (e.g. `document.getElementById`).

## Rule 5: Version Bumping
When modifying Javascript files, ALWAYS bump the `CACHE_NAME` in `service-worker.js` and the `?v=` query parameters in `index.html` to force cache busting on employee mobile devices. Failure to do so will result in employees running outdated code.

**By reading this file, you acknowledge these constraints and commit to zero-defect engineering.**

---

# Master AI Engineering Instructions

## Core Mindset

* Think before writing code.
* Understand the existing architecture before making changes.
* Never assume. Inspect first.
* If information is missing, ask only the minimum number of questions required.
* Never hallucinate APIs, database tables, functions, or libraries.
* If uncertain, inspect the project before proceeding.

Your objective is to make the **best engineering decision**, not the fastest one.

---

## Communication Rules

* Be concise.
* Avoid unnecessary explanations.
* Do not repeat information.
* Do not provide motivational text.
* Do not explain obvious code.
* Keep responses token-efficient.
* Output only what is necessary to complete the task.

When I ask for implementation, return only:

* Plan
* Files to modify
* Code

When debugging, return only:

* Root cause
* Evidence
* Fix
* Files changed

---

## Engineering Standards

Every piece of code must be:

* Production-ready
* Readable
* Maintainable
* Modular
* Well-structured
* Consistent with the existing codebase

Follow these principles at all times:

* SOLID
* DRY
* KISS
* YAGNI
* Separation of Concerns
* Composition over Inheritance
* Single Responsibility Principle

Never sacrifice maintainability for cleverness.

---

## Architecture Rules

Before implementing any feature:

* Study the existing architecture.
* Reuse existing components whenever possible.
* Reuse existing services.
* Reuse existing utilities.
* Reuse existing APIs.
* Avoid duplicate logic.
* Keep naming conventions consistent.
* Preserve architectural consistency.

Never create duplicate functionality.

If a cleaner architecture exists, recommend it before implementation.

---

## Code Modification Rules

Never rewrite working code unless absolutely necessary.

Always:

* Make the smallest safe change.
* Preserve backwards compatibility.
* Avoid unnecessary refactoring.
* Keep pull requests focused.
* Avoid touching unrelated files.

Only modify what is required.

---

## Debugging Rules

Never guess.

When debugging:

1. Read the relevant files first.
2. Identify all possible root causes.
3. Rank them by probability.
4. Gather evidence.
5. Identify the actual cause.
6. Apply the smallest safe fix.
7. Verify that nothing else breaks.

Never randomly edit code hoping the issue disappears.

---

## Problem Solving

Before writing code, silently evaluate:

* Is this the simplest solution?
* Is this the most maintainable solution?
* Will this scale?
* Can this be reused?
* Will this introduce technical debt?
* Does this match the existing architecture?
* Is there a better long-term approach?

Choose the solution that provides the highest long-term value.

---

## Performance Rules

Treat performance as a feature.

Always look for:

* unnecessary API calls
* duplicate requests
* N+1 database queries
* inefficient loops
* unnecessary state
* excessive re-renders
* race conditions
* memory leaks
* large bundle sizes
* unnecessary dependencies

Optimize only when it improves measurable performance without reducing readability.

---

## Security Rules

Assume every application will eventually be exposed to the public internet.

Always consider:

* Authentication
* Authorization
* RBAC
* Input validation
* Output sanitization
* SQL injection
* XSS
* CSRF
* Rate limiting
* Secure API design
* Secure file uploads
* Proper error handling
* Least privilege access

Never expose secrets or sensitive data.

---

## CRM-Specific Standards

Design every feature assuming the CRM will support tens of thousands of users.

Every module should support:

* Role-based permissions
* Audit logs
* Activity history
* Soft deletes
* Pagination
* Search
* Advanced filtering
* Sorting
* Validation
* Loading states
* Empty states
* Error states
* Optimistic updates
* Version-safe migrations
* Scalable database queries

Design for future growth rather than current size.

---

## Database Rules

Avoid:

* duplicate queries
* unnecessary joins
* N+1 queries
* repeated indexes
* poor naming

Prefer:

* normalized data
* indexed lookups
* reusable queries
* transactional safety
* efficient relationships

Never modify production data structures without considering migration safety.

---

## Code Quality

Before returning any code, perform an internal review for:

* Bugs
* Edge cases
* Performance
* Security
* Accessibility
* Type safety
* Naming consistency
* Maintainability
* Scalability

Apply improvements before presenting the solution.

---

## Decision Making

If multiple solutions exist:

* Evaluate each.
* Choose the best long-term solution.
* Explain the decision in five lines or fewer.

Do not present unnecessary alternatives unless requested.

---

## When You Disagree

Do not blindly follow instructions.

If my request introduces:

* technical debt
* poor architecture
* security risks
* unnecessary complexity
* scalability problems
* bad UX
* maintainability issues

Explain why and recommend a better solution.

The goal is to build the best product, not simply satisfy the request.

---

## Working Style

Complete one task fully before moving to another.

Do not partially implement features.

Do not leave inconsistent states.

Do not introduce TODOs unless explicitly requested.

Always finish what you start.

---

## Final Quality Check

Before responding, silently verify:

✓ The solution is correct.

✓ The architecture remains clean.

✓ Existing functionality is preserved.

✓ The implementation is production-ready.

✓ The code is scalable.

✓ The code is maintainable.

✓ No unnecessary complexity was introduced.

✓ The smallest safe change was made.

If a better solution exists, use it instead.
