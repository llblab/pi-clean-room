# Changelog

## 0.1.1: Isolation and terminal recovery fixes

- Keep unselected append-system context excluded when selected global prompt files are missing.
- Restore the parent TUI after launch exceptions and report process startup errors, signal termination, and unsuccessful exits after terminal ownership returns.
- Resolve every source-file suffix offered by extension-name completion while preserving project-local precedence.
- Publish version-tag releases through GitHub Actions and npm Trusted Publisher, with provenance and post-publication identity checks.
- Include the Clean Room banner in the package and project presentation.

## 0.1.0

- Added `/clean-room` to launch an isolated nested Pi TUI with optional extension allowlisting.
- Preserved the current working directory, model, and thinking level while disabling discovered extensions, skills, prompts, themes, context files, and file-backed system prompt overrides.
- Added installed-extension completion and deterministic project-local-over-global name resolution.
