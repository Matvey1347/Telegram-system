# Page Patterns

## App Router Pages

Page files should primarily:

- Read params and search params.
- Render a feature container.
- Provide page-level layout.
- Avoid owning large data, mutation and modal implementations directly.
- Stay below 300 lines by moving workflows into feature modules.

## Feature Containers

Feature containers may own:

- React Query hooks for the feature.
- URL/search state.
- Mutation action handlers.
- Section composition.

They should delegate tables, modals, filters and cards to smaller components.

Repeated selectors, date pickers, modals, tables and metric cards should come from shared UI/domain components. If a feature needs a variation, compose the shared primitive in the feature module instead of copying page-local markup.

## Operational Dashboard Pages

- Use `PageHeader`.
- Put filters near the top.
- Keep metric cards compact.
- Tables should have loading, empty and error states.
- Use tabs for major workflow modes, not decorative grouping.

## Detail Pages

- Header contains entity identity and primary actions.
- Summary metrics come before deep tables.
- Settings and diagnostics should be collapsible or tabbed when dense.
- Preserve route URLs during refactors.

## Modals

- Use one modal per focused task.
- Keep open/edit/delete state in a hook or feature container when repeated.
- Use shared confirmation for destructive actions.
