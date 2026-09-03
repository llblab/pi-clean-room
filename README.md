# pi-clean-room

Launch a fresh, isolated Pi TUI with only the extensions you explicitly select. The parent session pauses while the clean-room owns the terminal and returns unchanged when the nested Pi exits.

## Installation

Requirements: Pi `0.84.4–0.84.x` and Node.js `22.19.0` or newer.

Install from npm:

```bash
pi install npm:@llblab/pi-clean-room
```

Or install from GitHub:

```bash
pi install git:github.com/llblab/pi-clean-room
```

Pi packages execute with full user permissions; review the source before installing, as with any extension.

## Usage

Install or load this extension, then run:

```text
/clean-room
/clean-room pi-telegram
/clean-room skills agents system append-system
/clean-room skills pi-telegram pi-actors
/clean-room skills/brain-storm
```

Arguments may be extension names or resource switches:

- `skills` — enable normal Pi skill discovery, including global (`~/.pi/agent/skills`, `~/.agents/skills`), project, package, and configured skills
- `skills/<name>` — load only that skill from known global or project skill directories (for example, `skills/brain-storm`)
- `agents` — include `~/.pi/agent/AGENTS.md`
- `system` — use `~/.pi/agent/SYSTEM.md`
- `append-system` — include `~/.pi/agent/APPEND_SYSTEM.md`

Extension names are resolved from the global or project-local extensions directory. Absolute and working-directory-relative extension paths are also accepted. Project-local names take precedence over global names.

The nested Pi starts in the current working directory with the current model and thinking level. All optional resources are disabled unless named explicitly. Pi's built-in system prompt and built-in tools remain available.

Exit the nested TUI normally with `Ctrl+D` to return to the parent session.

## Limitations

- Interactive terminal ownership requires Pi TUI mode. RPC, JSON, and print modes are rejected.
- The clean-room retains Pi's built-in base system prompt and built-in tools.
- Extension arguments cannot contain whitespace.
