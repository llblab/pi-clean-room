# Agent Notes

- `Isolation boundary`: Keep clean-room isolation process-based. Do not simulate isolation by filtering an already-loaded parent runtime because sibling extension handlers cannot be reliably unregistered.
- `Terminal ownership`: Launch nested Pi only through `ctx.ui.custom()`, stop the parent TUI before inheriting stdio, and restart plus fully rerender it after the child exits.
- `Zero configuration`: Keep `/clean-room <extension...>` as the complete user contract. Resolve project-local names before global names and do not add profiles or persisted configuration without a new requirement.
