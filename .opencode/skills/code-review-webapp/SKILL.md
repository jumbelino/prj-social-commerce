---
name: code-review-webapp
description: "Reviews webapp code changes focusing on correctness, security, and data integrity. Use when reviewing PRs, diffs, or code changes in React, Next.js, FastAPI, or SQLAlchemy. Triggered by: review, pr, diff, code review, pull request, merge."
---

# What I do
- review code changes by risk, not by nitpicks
- prioritize correctness and regression prevention
- detect security, auth, validation, and data integrity issues
- flag performance and maintainability problems when they matter
- separate critical issues from optional improvements

# How to work
1. Begin by identifying the apparent intent of the change.
2. Review in this order:
   - correctness
   - data integrity
   - auth/security
   - error handling
   - edge cases
   - performance
   - maintainability
   - ux/a11y impact
3. Prefer comments tied to concrete failure modes.
4. Flag hidden coupling:
   - duplicated business rules
   - fragile assumptions
   - magic constants
   - inconsistent validation
   - api contract drift
5. Watch for common web risks:
   - missing authorization check
   - trusting client input too much
   - silent failure paths
   - stale state after mutation
   - race conditions
   - non-idempotent retries
   - optimistic ui without rollback
   - unindexed or expensive queries
   - a11y regressions in forms and dialogs
6. Do not over-penalize style if the code is correct and consistent with the repo.
7. When possible, suggest the smallest safe improvement instead of broad rewrites.

# Severity model
## Critical
Would cause data loss, broken auth, security issue, production failure, or incorrect core behavior.

## Major
Likely regression, broken edge case, poor error handling, or design likely to fail under normal use.

## Minor
Readability, small maintainability issues, or non-blocking polish.

# Output pattern
## Summary
<one paragraph>

## Critical
- ...

## Major
- ...

## Minor
- ...

## Suggested fixes
- ...
