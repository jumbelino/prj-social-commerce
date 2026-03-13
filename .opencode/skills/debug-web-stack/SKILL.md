---
name: debug-web-stack
description: "Debugs web application issues across React, Next.js, FastAPI, and SQLAlchemy layers. Use when fixing bugs, errors, unexpected behavior, or regressions. Triggered by: bug, error, debug, fix, issue, regression, not working, broken."
---

# What I do
- diagnose bugs with a reproduce-isolate-verify workflow
- separate symptoms from probable causes
- prioritize observability and fast narrowing over guesswork
- look across browser, app, api, infra, and data boundaries
- propose the smallest fix that addresses the verified cause

# How to work
1. Start with the symptom:
   - what is happening
   - what should happen
   - where it happens
   - how often it happens
2. Convert vague reports into a precise failure statement.
3. Classify the problem:
   - rendering/ui
   - state synchronization
   - request/response
   - validation/form
   - auth/session
   - data integrity
   - environment/config
   - race condition/timing
4. Reconstruct the path:
   - trigger
   - client behavior
   - network call
   - server logic
   - storage side effect
   - response handling
5. Generate 2 to 5 likely causes, ordered by probability.
6. Prefer checks that quickly eliminate whole branches:
   - console/network inspection
   - request payload mismatch
   - stale cache/state
   - permission/session mismatch
   - env var/config mismatch
   - schema/typing mismatch
7. Distinguish:
   - confirmed cause
   - plausible cause
   - unknown
8. Only propose code fixes after narrowing the cause enough to justify the change.

# Decision rules
- never jump to a refactor before isolating the bug
- if a bug appears random, inspect state timing, stale closures, async ordering, caching, or duplicate sources of truth
- if the bug crosses client/server boundaries, trace one concrete request end-to-end
- if auth is involved, inspect session source, token freshness, role checks, and redirect logic
- if forms are involved, inspect controlled/uncontrolled state, validation timing, disabled submit behavior, and server error mapping

# Output pattern
## Symptom
...

## Expected behavior
...

## Most likely causes
1. ...
2. ...
3. ...

## Fastest checks
- ...
- ...

## Recommended fix
...

## Regression checks
- ...
- ...
