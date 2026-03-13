---
name: form-ux-review
description: "Reviews forms to reduce friction, improve validation feedback, and strengthen completion confidence. Use when building or improving user input forms. Triggered by: form, validation, input, field, submit, signup, login, checkout form."
---

# What I do
- reduce unnecessary form friction
- improve field sequencing and grouping
- make validation and errors easier to understand and recover from
- strengthen completion confidence without bloating the form
- suggest practical improvements that fit production apps

# How to work
1. Determine the form's primary goal.
2. Identify the minimum information truly required.
3. Review the form in this order:
   - required vs optional fields
   - field order
   - grouping and chunking
   - labels and helper text
   - defaults and placeholders
   - validation timing
   - error wording
   - submit/disabled behavior
   - confirmation/success feedback
4. Flag anti-patterns:
   - asking too much too early
   - unclear field purpose
   - placeholder as the only label
   - validation too late
   - validation too early and noisy
   - errors without recovery guidance
   - ambiguous button text
   - locked submit with no explanation
5. Prefer reducing fields over explaining too many fields.
6. For long forms, suggest segmentation only if it clearly reduces cognitive load.

# Decision rules
- labels must beat placeholders for clarity
- every validation error should tell the user what to fix
- button labels should reflect the action outcome
- optional fields should not visually compete with required fields
- if the user risks losing work, suggest persistence or warning

# Output pattern
## Form goal
...

## Friction points
- ...

## Field/order issues
- ...

## Validation and error issues
- ...

## Recommended changes
1. ...
2. ...
3. ...
