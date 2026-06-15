# Plan Compact Restore

Install: copy `plan-compact-restore.js` to `~/.config/opencode/plugins/`.
Add to `~/.config/opencode/tui.jsonc`: `{ "plugin": ["./plugins/plan-compact-restore.js"] }`.
Restart opencode.
Use `/plan-compact-restore` or `/pcr` in a Plan-mode session.
It updates the plan, compacts, and pastes the plan for you to submit.
