---
name: api-design-crud
description: "Designs REST API endpoints with FastAPI, SQLAlchemy, and Pydantic validation. Use when building backend routes, creating CRUD operations, or defining API contracts. Triggered by: api, endpoint, route, crud, fastapi, rest, backend."
---

# What I do
- design practical, boring, maintainable api contracts
- keep payloads predictable and validation explicit
- align authorization with the real business action
- reduce hidden coupling between frontend and backend
- prefer stable patterns over fashionable abstractions

# How to work
1. Identify the resource or action clearly.
2. Distinguish:
   - resource operations
   - workflow actions
   - admin actions
3. Define:
   - inputs
   - validation
   - authorization rule
   - success response
   - error response
4. Keep naming stable and obvious.
5. Prefer explicit error semantics:
   - validation error
   - auth/forbidden
   - not found
   - conflict
   - server failure
6. For lists, specify:
   - filtering
   - sorting
   - pagination
   - defaults
7. For writes, specify:
   - required fields
   - optional fields
   - idempotency expectations
   - side effects
8. Avoid leaking db structure directly unless it is intentional and stable.

# Decision rules
- validate on the server even if the client validates
- authorization is not the same as authentication
- prefer server-generated canonical fields over trusting the client
- make partial updates explicit
- if the ui depends on a derived field, define who owns that derivation

# Output pattern
## Endpoint / action
...

## Purpose
...

## Input
```json
{}
```

## Success output
```json
{}
```

## Errors
* 400 ...
* 401 ...
* 403 ...
* 404 ...
* 409 ...
* 500 ...

## Notes
* validation:
* authorization:
* side effects:
