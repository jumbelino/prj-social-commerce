---
name: frontend-component-builder
description: "Builds React and Next.js components with TypeScript, Tailwind, and proper state handling. Use when implementing UI components, forms, dialogs, or interactive interfaces. Triggered by: component, react, nextjs, frontend, ui, form, button, dialog, card, modal."
---

# What I do
- build components that are clear, resilient, and easy to extend
- treat loading, empty, error, and success as first-class states
- preserve accessibility and keyboard behavior
- prefer composition over tangled mega-components
- keep business logic separate from pure presentation when practical

# How to work
1. Start from the user task the component supports.
2. Define states before implementation:
   - loading
   - empty
   - populated
   - error
   - disabled
   - submitting
3. Identify component boundaries:
   - container/data logic
   - presentational pieces
   - form controls
   - reusable primitives
4. Prefer explicit props and predictable ownership of state.
5. Avoid hidden side effects in render flow.
6. For forms and dialogs, ensure:
   - focus flow
   - keyboard escape/submit behavior
   - clear validation and error display
7. For lists and tables, ensure:
   - stable keys
   - empty state
   - loading placeholder
   - action clarity
8. For responsive layouts, preserve task clarity on smaller screens before adding polish.

# Decision rules
- do not build one component that tries to own every concern
- if a piece can be reused with stable semantics, extract it
- if extracting increases indirection without reuse, keep it local
- avoid prop designs that require reading internal implementation to understand usage
- when choosing between visual cleverness and usability clarity, choose clarity

# Output pattern
## Component goal
...

## States
- loading:
- empty:
- error:
- success:
- disabled/submitting:

## Structure
- container:
- presentational:
- child components:

## Accessibility checks
- ...
- ...

## Implementation notes
- ...
