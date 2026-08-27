# Koma demo UX principles

These rules apply whenever the demo grows toward a landing page. They are
adapted from UX Magazine's [Designing the Perfect Button](https://uxmag.com/articles/designing-the-perfect-button)
and from problems already observed in the Koma demo.

## Actions must be clear, findable, and identifiable

- A button label is a promise. Start with a verb and name the result:
  `Copy Miko setup`, `Classify this prompt`, or `Run scraper attack`.
- Do not use an icon as the only explanation for an unfamiliar action. An icon
  may support a text label, but must not replace it.
- Put an action next to the object and context it affects. Installation belongs
  beneath the active package's explanation; scenario actions belong inside the
  corresponding demo terminal.
- Keep interactive controls visually distinct from evidence, status, and static
  metadata. A green check or bordered receipt must not look like a button.

## Preserve a visible hierarchy

- Each visible tab has one primary demo action. Installation copy controls are
  recognizable secondary actions; documentation links are tertiary.
- Do not give every action the same color, border, size, or elevation.
- Keep important actions visible without hiding them in overflow menus. Hide
  only rare, non-path actions.
- Use a minimum 44 px touch target for principal and installation actions, with
  visible keyboard focus and outcome feedback.

## Reduce work after the click

- Copy the complete runnable command, not a fragment the user must reconstruct.
- When setup requires two commands, copy both in their execution order.
- Confirm success in the control itself, and describe the next step beside the
  command rather than making the user search another section.
- On narrow screens, stack the command and action without truncating either.

## Current install pattern

Every product tab uses the same sequence:

1. Package-specific outcome and direct setup-guide link.
2. A literal npm command, or the complete Miko install-and-init sequence.
3. A package-named copy action with visible success or failure feedback.
4. One short note explaining where the package belongs in the request path.
