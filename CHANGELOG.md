# Changelog

## 0.2.0: Named npm extensions and isolated model selection

- Launch installed npm extensions by package name, including scoped packages, without exposing their other resources to the clean room.
- Start clean rooms from extension-backed parent models without failing on excluded providers; when a built-in model scope remains, pass only its valid entries to avoid child startup warnings from stale patterns.

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
