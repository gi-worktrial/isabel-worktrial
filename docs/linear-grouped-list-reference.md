# Linear grouped list reference

Captured from the supplied screenshot on 2026-10-18.

## In five words

Dense, grouped, quiet, scannable, state-led.

## Structural idea

The list is not one table. Each workflow state is a full-width section with a distinct header and a stack of compact rows. State, label, and count live in the section header instead of repeating in every row.

## Measured from the screenshot

- Section header: about 56 px tall, full width, subtly raised from the rows.
- Row: about 64 px tall, one line, divided by hairline separators.
- Left inset: about 54 px for section labels and row controls.
- State mark: about 20 px; section count sits 8–12 px after the label.
- Row rhythm: ID, state mark, flexible title, optional metadata, date, owner.
- Section gap: effectively zero; the stronger section header separates groups.
- Surfaces: one continuous panel with borders and slight tonal changes, not separate cards.

## What to carry into Grounded

- Group Issues by state in the existing `ISSUE_STATES` order.
- Put the state mark, state name, and count in a full-width section header.
- Remove the repeated State column from each row.
- Keep each Issue row compact and single-line: severity, ID, title, status, trace count, elapsed time.
- Preserve Grounded's current type, colors, marks, routes, and hover/focus behavior.
- Keep sections expanded; do not borrow Linear's assignee or project inventory.

## Interaction

- Whole row remains the primary Issue action.
- Trace count remains a direct link.
- Hover uses Grounded's existing quiet fill.
- Keyboard focus remains visible on row actions.

## Build targets

- 32–36 px section headers.
- 36–40 px rows.
- Hairline dividers between rows and sections.
- No outer card radius around every row.
- Metadata aligned on the right; title consumes remaining width.
