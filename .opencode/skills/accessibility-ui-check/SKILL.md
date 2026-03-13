---
name: accessibility-ui-check
description: Reviews UI components for accessibility issues and suggests WCAG-compliant fixes. Use when reviewing UI for accessibility, checking a11y compliance, or improving keyboard navigation. Triggered by: accessibility, a11y, wcag, keyboard, screen reader, aria, focus.
---

# What I do
- review ui for real accessibility risks that affect usage
- prioritize keyboard, focus, labeling, semantics, and feedback
- catch common accessibility regressions in app interfaces
- suggest concrete fixes instead of generic compliance language
- favor practical improvements that fit real codebases

# How to work
1. Review the interface through these lenses:
   - keyboard-only usage
   - focus visibility and order
   - semantic structure
   - label clarity
   - state and error communication
   - interaction predictability
2. Check common problem areas:
   - dialogs/modals
   - forms
   - icon-only buttons
   - custom dropdowns/comboboxes
   - tabs
   - tables
   - toasts and inline errors
   - route/page transitions
3. Look for:
   - missing accessible names
   - broken focus trap/restore
   - weak heading hierarchy
   - interactive div/span patterns
   - status changes not communicated clearly
   - color-only meaning
   - poor keyboard access to actions
4. Prioritize issues by actual user impact.
5. Suggest fixes that align with the existing component model where possible.

# Decision rules
- keyboard access is not optional
- visible focus must remain visible
- semantic html is preferred unless a custom widget is justified
- labels, errors, and status changes must be understandable without guesswork
- accessibility fixes should preserve task flow, not just satisfy a checklist

# Output pattern
## Critical issues
- ...

## Major issues
- ...

## Minor issues
- ...

## Recommended fixes
- ...
